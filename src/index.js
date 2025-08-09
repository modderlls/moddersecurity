import { createCipheriv, createDecipheriv, randomBytes, scryptSync, publicEncrypt, privateDecrypt, constants } from 'crypto';

class ModderSecureSDK {
    /**
     * ModderSecure SDK konstruktori.
     * Bu SDK server tomonida ishlatilishi uchun mo'ljallangan.
     * Asosiy master kalit ENV o'zgaruvchidan olinadi.
     *
     * @param {string} serverMasterKeyString - Serverning asosiy master kaliti stringi.
     */
    constructor(serverMasterKeyString) {
        if (!serverMasterKeyString || typeof serverMasterKeyString !== 'string') {
            throw new Error('ModderSecureSDK: Server Master Key string is required.');
        }

        const masterKeySalt = process.env.MODDERSECURE_MASTER_SALT;
        if (process.env.NODE_ENV === 'production' && !masterKeySalt) {
            throw new Error("MODDERSECURE_MASTER_SALT is required in production environment.");
        }
        const saltBuffer = Buffer.from(masterKeySalt || 'DEV_FALLBACK_SALT_DO_NOT_USE_IN_PROD_1234567890', 'utf8');
        
        this.aesMasterKey = scryptSync(serverMasterKeyString, saltBuffer, 32); // 32 bayt (256 bit) kalit
        this.algorithm = 'aes-256-gcm';
    }

    /**
     * Ma'lumotlarni berilgan AES Session Key bilan shifrlash.
     * Bu funksiya serverdan mijozga javob yuborishda ishlatiladi.
     *
     * @param {Object} data - Shifrlanadigan JavaScript obyekti.
     * @param {Buffer} sessionKey - Ma'lumotni shifrlash uchun ishlatiladigan 32-baytlik AES Session Key (Buffer).
     * @param {string} [requestId] - So'rov uchun noyob ID. Agar berilmasa, tasodifiy generatsiya qilinadi.
     * @returns {string} Yangi "msc" formatida shifrlangan string.
     */
    encrypt(data, sessionKey, requestId = randomBytes(8).toString('hex')) {
        if (!sessionKey || !Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
            throw new Error('ModderSecureSDK: Valid 32-byte sessionKey (Buffer) is required for encryption.');
        }

        const iv = randomBytes(12); // 12 bayt IV (Nonce) har bir shifrlash uchun noyob
        const cipher = createCipheriv(this.algorithm, sessionKey, iv);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        const encryptedPayloadString = `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;

        const mjsonResponse = {
            request: requestId, // So'rov ID
            timestamp: Date.now(), // So'rov vaqti
            id: encryptedPayloadString, // Shifrlangan kontent
            is_secured: true
        };

        return `msc${JSON.stringify(mjsonResponse)}`;
    }

    /**
     * Mijozdan kelgan shifrlangan "msc" ma'lumotlarni deshifrlash (serverda),
     * yoki mijoz tomonida berilgan AES Session Key bilan deshifrlash.
     *
     * @param {string} mjsonString - Yangi "mjson" formatida shifrlangan string.
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

        const jsonString = mjsonString.substring(3);

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
        if (typeof mjsonObject.request !== 'string' || typeof mjsonObject.timestamp !== 'number') {
            throw new Error('ModderSecureSDK: Invalid mjson structure. Missing or invalid "request" or "timestamp" field.');
        }

        const encryptedPayloadString = mjsonObject.id;
        const parts = encryptedPayloadString.split(':');
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

    /**
     * Serverda RSA public key bilan simmetrik kalitni (AES Session Key) shifrlash.
     * Mijozga xavfsiz session key yuborish uchun ishlatiladi.
     * @param {Buffer} sessionKey - Shifrlanadigan 32-baytlik AES Session Key (Buffer).
     * @param {string} rsaPublicKeyPem - Mijozning PEM formatidagi RSA public key stringi.
     * @returns {string} Base64 kodlangan shifrlangan session key stringi.
     */
    encryptSessionKeyWithRsa(sessionKey, rsaPublicKeyPem) {
        if (!Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
            throw new Error('ModderSecureSDK: Session key must be a 32-byte Buffer.');
        }
        return publicEncrypt({ key: rsaPublicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING }, sessionKey).toString('base64');
    }
    
    // Server tomonida RSA private key bilan session keyni deshifrlash (agar kerak bo'lsa)
    // Bu funksiya hozircha ishlatilmaydi, lekin kelajak uchun SDKda bo'lishi mumkin.
    decryptSessionKeyWithRsa(encryptedSessionKeyBase64, rsaPrivateKeyPem) {
        const encryptedBuffer = Buffer.from(encryptedSessionKeyBase64, 'base64');
        return privateDecrypt({ key: rsaPrivateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING }, encryptedBuffer);
    }

    /**
     * Premium PseudoKey bilan bog'liq maxsus funksiyalar (serverda).
     * @param {string} pseudoKey - Premium mijoz tomonidan taqdim etilgan pseudoKey.
     * @param {string} encryptedRequestData - Mijozning shifrlangan so'rov ma'lumotlari (mjson formatida).
     * @param {Buffer} sessionKey - Mijozning joriy session key'i (Buffer).
     * @returns {string} Qayta ishlangan va shifrlangan javob (mjson formatida).
     */
    handlePremiumRequest(pseudoKey, encryptedRequestData, sessionKey) {
        if (!this.isValidPseudoKey(pseudoKey)) {
            throw new Error('ModderSecureSDK: Invalid pseudoKey for premium access.');
        }
        if (!sessionKey || !Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
            throw new Error('ModderSecureSDK: Valid sessionKey (Buffer) is required for premium request.');
        }

        let requestData;
        try {
            requestData = this.decrypt(encryptedRequestData, sessionKey); // So'rovni o'sha sessionKey bilan deshifrlash
        } catch (error) {
            throw new Error('ModderSecureSDK: Failed to decrypt premium request data. ' + error.message);
        }

        console.log(`Handling premium request with pseudoKey: ${pseudoKey} and decrypted data:`, requestData);

        const premiumResponseContent = { message: "Premium data for user " + requestData.userId, report: "Full detailed report here..." };
        return this.encrypt(premiumResponseContent, sessionKey, requestData.request); // Javobni o'sha sessionKey bilan shifrlash
    }

    /**
     * PseudoKey ning haqiqiyligini tekshirish logikasi.
     * @param {string} pseudoKey - Tekshiriladigan pseudoKey.
     * @returns {boolean} Haqiqiy bo'lsa true, aks holda false.
     */
    isValidPseudoKey(pseudoKey) {
        return pseudoKey === process.env.MODDERSECURE_PREMIUM_PSEUDO_KEY;
    }
}

export { ModderSecureSDK };