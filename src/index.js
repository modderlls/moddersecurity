import { createCipheriv, createDecipheriv, randomBytes, scryptSync, publicEncrypt, privateDecrypt, constants } from 'crypto';

class ModderSecureSDK {
    constructor(serverMasterKeyString) {
        if (!serverMasterKeyString || typeof serverMasterKeyString !== 'string') {
            throw new Error('ModderSecureSDK: Server Master Key string is required.');
        }

        const masterKeySalt = process.env.MODDERSECURE_MASTER_SALT;
        if (process.env.NODE_ENV === 'production' && !masterKeySalt) {
            throw new Error("MODDERSECURE_MASTER_SALT is required in production environment.");
        }
        const saltBuffer = Buffer.from(masterKeySalt || 'DEV_FALLBACK_SALT_DO_NOT_USE_IN_PROD_1234567890', 'utf8');
        
        this.aesMasterKey = scryptSync(serverMasterKeyString, saltBuffer, 32);
        this.algorithm = 'aes-256-gcm';
    }

    /**
     * Ma'lumotlarni berilgan AES Session Key bilan shifrlash.
     * Bu endi 'msc' prefiksi bilan JSON stringini qaytaradi, uni {} siz yuborish keyinchalik qilinadi.
     *
     * @param {Object} data - Shifrlanadigan JavaScript obyekti.
     * @param {Buffer} sessionKey - Ma'lumotni shifrlash uchun ishlatiladigan 32-baytlik AES Session Key (Buffer).
     * @returns {Object} { mscString: string, originalRequestId: string, originalTimestamp: number }
     */
    encrypt(data, sessionKey) {
        if (!sessionKey || !Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
            throw new Error('ModderSecureSDK: Valid 32-byte sessionKey (Buffer) is required for encryption.');
        }

        const iv = randomBytes(12);
        const cipher = createCipheriv(this.algorithm, sessionKey, iv);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        const actualEncryptedPayloadString = `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;

        // Shifrlangan payload stringini teskari o'girish
        const reversedEncryptedId = actualEncryptedPayloadString.split('').reverse().join('');
        
        // Asosiy ma'lumotlar ichiga solinadigan Request ID va Timestamp
        const originalRequestId = randomBytes(8).toString('hex');
        const originalTimestamp = Date.now();

        // Vaqtga asoslangan yangi ID (chalg'ituvchi)
        const newTimeBasedId = Date.now().toString(36) + randomBytes(4).toString('hex');

        const mjsonResponse = {
            id: reversedEncryptedId, // Teskari o'girilgan asl shifr
            new_id: newTimeBasedId, // Vaqtga asoslangan yangi ID
            is_secured: true,
            request: originalRequestId, // Payload ichidagi haqiqiy Request ID
            timestamp: originalTimestamp // Payload ichidagi haqiqiy Timestamp
        };

        return {
            mscString: `msc${JSON.stringify(mjsonResponse)}`,
            originalRequestId: originalRequestId,
            originalTimestamp: originalTimestamp
        };
    }

    /**
     * Yangi "msc" formatidagi shifrlangan ma'lumotlarni deshifrlash.
     *
     * @param {string} mjsonString - Yangi "msc" formatida shifrlangan string ({} siz).
     * @param {Buffer} sessionKey - Ma'lumotni deshifrlash uchun ishlatiladigan 32-baytlik AES Session Key (Buffer).
     * @returns {Object} Deshifrlangan JavaScript obyekti.
     * @throws {Error} Agar deshifrlash muvaffaqiyatsiz bo'lsa yoki format noto'g'ri bo'lsa.
     */
    decrypt(mjsonString, sessionKey) {
        if (!sessionKey || !Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
            throw new Error('ModderSecureSDK: Valid 32-byte sessionKey (Buffer) is required for decryption.');
        }
        if (!mjsonString || typeof mjsonString !== 'string') {
            throw new Error('ModderSecureSDK: Input must be a string.');
        }

        if (!mjsonString.startsWith('msc{') || !mjsonString.endsWith('}')) {
            throw new Error('ModderSecureSDK: Invalid mjson format. Data is not properly secured or tampered with prefix/suffix.');
        }

        const jsonString = mjsonString.substring(3); // "msc" prefiksini olib tashlash

        let mjsonObject;
        try {
            mjsonObject = JSON.parse(jsonString);
        } catch (error) {
            throw new Error('ModderSecureSDK: Failed to parse mjson string. Invalid JSON format.');
        }

        if (mjsonObject.is_secured === false) {
            throw new Error('ModderSecureSDK: Data explicitly marked as not secured (is_secured: false).');
        }
        if (!mjsonObject.id || typeof mjsonObject.id !== 'string') {
            throw new Error('ModderSecureSDK: Invalid mjson structure. Missing or invalid "id" field.');
        }
        if (!mjsonObject.new_id || typeof mjsonObject.new_id !== 'string') {
            throw new Error('ModderSecureSDK: Invalid mjson structure. Missing or invalid "new_id" field.');
        }
        if (typeof mjsonObject.request !== 'string' || typeof mjsonObject.timestamp !== 'number') {
            throw new Error('ModderSecureSDK: Invalid mjson structure. Missing or invalid "request" or "timestamp" field.');
        }

        // Asl shifrlangan payload stringini teskari o'girish
        const actualEncryptedPayloadString = mjsonObject.id.split('').reverse().join('');
        
        const parts = actualEncryptedPayloadString.split(':');
        if (parts.length !== 3) {
            throw new Error('ModderSecureSDK: Invalid encrypted payload format within mjson. (IV:encrypted:authTag expected)');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');

        const decipher = createDecipheriv(this.algorithm, sessionKey, iv);
        decipher.setAuthTag(authTag);

        try {
            let decrypted = decipher.update(encryptedText, 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('ModderSecureSDK: Decryption failed. Data might be tampered or key is incorrect.', error);
            throw new Error('ModderSecureSDK: Decryption failed. Invalid or tampered data.');
        }
    }

    encryptSessionKeyWithRsa(sessionKey, rsaPublicKeyPem) {
        if (!Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
            throw new Error('ModderSecureSDK: Session key must be a 32-byte Buffer.');
        }
        return publicEncrypt({ key: rsaPublicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING }, sessionKey).toString('base64');
    }
    
    decryptSessionKeyWithRsa(encryptedSessionKeyBase64, rsaPrivateKeyPem) {
        const encryptedBuffer = Buffer.from(encryptedSessionKeyBase64, 'base64');
        return privateDecrypt({ key: rsaPrivateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING }, encryptedBuffer);
    }

    /**
     * Request ID va Timestamp ma'lumotlarini serverning Master Key bilan shifrlash
     * HTTP Header'da yuborish uchun.
     * @param {string} requestId - Har bir so'rov uchun noyob ID.
     * @param {number} timestamp - So'rov yuborilgan vaqt tamg'asi (milliseconds).
     * @returns {string} Shifrlangan header stringi (Base64 formatida).
     */
    encryptHeaderData(requestId, timestamp) {
        const headerData = { requestId, timestamp };
        const iv = randomBytes(12);
        const cipher = createCipheriv(this.algorithm, this.aesMasterKey, iv); // Master Key bilan shifrlash

        let encrypted = cipher.update(JSON.stringify(headerData), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
    }

    /**
     * Header'dan kelgan shifrlangan ma'lumotni Master Key bilan deshifrlash.
     * @param {string} encryptedHeaderData - Header'dan olingan shifrlangan string.
     * @returns {Object} Deshifrlangan obyekti ({ requestId: string, timestamp: number }).
     */
    decryptHeaderData(encryptedHeaderData) {
        const parts = encryptedHeaderData.split(':');
        if (parts.length !== 3) {
            throw new Error('ModderSecureSDK: Invalid encrypted header data format.');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');

        const decipher = createDecipheriv(this.algorithm, this.aesMasterKey, iv); // Master Key bilan deshifrlash
        decipher.setAuthTag(authTag);

        try {
            let decrypted = decipher.update(encryptedText, 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('ModderSecureSDK: Header decryption failed. Data might be tampered or master key is incorrect.', error);
            throw new Error('ModderSecureSDK: Header decryption failed. Invalid or tampered header data.');
        }
    }


    handlePremiumRequest(pseudoKey, encryptedRequestData, sessionKey) {
        if (!this.isValidPseudoKey(pseudoKey)) {
            throw new Error('ModderSecureSDK: Invalid pseudoKey for premium access.');
        }
        if (!sessionKey || !Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
            throw new Error('ModderSecureSDK: Valid sessionKey (Buffer) is required for premium request.');
        }

        let requestData;
        try {
            requestData = this.decrypt(encryptedRequestData, sessionKey);
        } catch (error) {
            throw new Error('ModderSecureSDK: Failed to decrypt premium request data. ' + error.message);
        }

        console.log(`Handling premium request with pseudoKey: ${pseudoKey} and decrypted data:`, requestData);

        const premiumResponseContent = { message: "Premium data for user " + requestData.userId, report: "Full detailed report here..." };
        return this.encrypt(premiumResponseContent, sessionKey).mscString; // FAQAT mscStringni qaytarish
    }

    isValidPseudoKey(pseudoKey) {
        return pseudoKey === process.env.MODDERSECURE_PREMIUM_PSEUDO_KEY;
    }
}

export { ModderSecureSDK };