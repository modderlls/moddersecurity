import { createCipheriv, createDecipheriv, randomBytes, scryptSync, publicEncrypt, privateDecrypt, generateKeyPairSync } from 'crypto';

class ModderSecureSDK {
    /**
     * ModderSecure SDK konstruktori.
     * Bu SDK server tomonida ishlatilishi uchun mo'ljallangan.
     * Kalitlar ENV o'zgaruvchilardan olinishi kerak.
     *
     * @param {string} serverMasterKeyString - Serverning asosiy master kaliti. Bu .env dan olinadi.
     */
    constructor(serverMasterKeyString) {
        if (!serverMasterKeyString || typeof serverMasterKeyString !== 'string') {
            throw new Error('ModderSecureSDK: Server Master Key string is required.');
        }

        const masterKeySalt = Buffer.from(process.env.MODDERSECURE_MASTER_SALT || 'SECURE_FALLBACK_SALT_DO_NOT_USE_IN_PROD', 'utf8');
        if (process.env.NODE_ENV === 'production' && !process.env.MODDERSECURE_MASTER_SALT) {
            throw new Error("MODDERSECURE_MASTER_SALT is required in production environment.");
        }
        
        this.aesMasterKey = scryptSync(serverMasterKeyString, masterKeySalt, 32); // 32 bayt (256 bit) kalit
        this.algorithm = 'aes-256-gcm';
    }

    /**
     * Gibrid shifrlash: Serverda ma'lumotni shifrlash va mijozga yuborish.
     * Bu funksiya asosiy serverMasterKey bilan emas, balki
     * har bir session uchun yaratilgan AES Session Key bilan ishlaydi.
     *
     * @param {Object} data - Shifrlanadigan JavaScript obyekti.
     * @param {Buffer} sessionKey - Ma'lumotni shifrlash uchun ishlatiladigan AES Session Key.
     * @param {string} requestId - So'rov uchun noyob ID.
     * @returns {string} Yangi "mjson" formatida shifrlangan string.
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
     * Mijozdan kelgan shifrlangan ma'lumotlarni deshifrlash (serverda).
     * Yoki mijoz tomonida berilgan session key bilan deshifrlash.
     * Bu funksiya endi sessionKey ni qabul qiladi.
     *
     * @param {string} mjsonString - Yangi "mjson" formatida shifrlangan string.
     * @param {Buffer} sessionKey - Ma'lumotni deshifrlash uchun ishlatiladigan AES Session Key.
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
        // Timestamp va Request ID ni tekshirish (Replay Attacksga qarshi)
        // Server tomonida qilinishi kerak, chunki serverda so'rovlar tarixini kuzatish mumkin
        // Bu joyda faqat format tekshiruvini qo'shamiz
        if (typeof mjsonObject.request !== 'string' || typeof mjsonObject.timestamp !== 'number') {
            throw new Error('ModderSecureSDK: Invalid mjson structure. Missing or invalid "request" or "timestamp" field.');
        }


        const encryptedPayloadString = mjsonObject.id;
        const parts = encryptedPayloadString.split(':');
        if (parts.length !== 3) {
            throw new Error('ModderSecureSDK: Invalid encrypted payload format within mjson. (IV:encrypted:authTag expected)');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const authTag = Buffer.from(parts[2], 'hex');

        const decipher = createDecipheriv(this.algorithm, sessionKey, iv); // Session Key bilan deshifrlash
        decipher.setAuthTag(authTag);

        try {
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('ModderSecureSDK: Decryption failed. Data might be tampered or key is incorrect.', error);
            throw new Error('ModderSecureSDK: Decryption failed. Invalid or tampered data.');
        }
    }

    /**
     * Serverda RSA kalit juftligini generatsiya qilish.
     * Bu faqat test yoki ma'lum maqsadlar uchun serverda ishlatilishi mumkin.
     * Mijoz tomonida RSA kalit juftligini Web Crypto API orqali yaratish tavsiya etiladi.
     */
    generateRsaKeyPair() {
        const { publicKey, privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048, // Tavsiya etilgan uzunlik
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
        return { publicKey, privateKey };
    }

    /**
     * RSA public key bilan simmetrik kalitni (AES Session Key) shifrlash.
     * @param {Buffer} sessionKey - Shifrlanadigan AES Session Key.
     * @param {string} rsaPublicKeyPem - Mijozning PEM formatidagi RSA public key.
     * @returns {string} Base64 kodlangan shifrlangan session key.
     */
    encryptSessionKeyWithRsa(sessionKey, rsaPublicKeyPem) {
        if (!Buffer.isBuffer(sessionKey) || sessionKey.length !== 32) {
            throw new Error('ModderSecureSDK: Session key must be a 32-byte Buffer.');
        }
        return publicEncrypt({ key: rsaPublicKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING }, sessionKey).toString('base64');
    }

    /**
     * RSA private key bilan shifrlangan simmetrik kalitni (AES Session Key) deshifrlash.
     * @param {string} encryptedSessionKeyBase64 - Base64 kodlangan shifrlangan session key.
     * @param {string} rsaPrivateKeyPem - Mijozning PEM formatidagi RSA private key.
     * @returns {Buffer} Deshifrlangan AES Session Key (Buffer).
     */
    decryptSessionKeyWithRsa(encryptedSessionKeyBase64, rsaPrivateKeyPem) {
        const encryptedBuffer = Buffer.from(encryptedSessionKeyBase64, 'base64');
        return privateDecrypt({ key: rsaPrivateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING }, encryptedBuffer);
    }

    /**
     * Premium PseudoKey bilan bog'liq maxsus funksiyalar.
     * @param {string} pseudoKey - Premium mijoz tomonidan taqdim etilgan pseudoKey.
     * @param {string} encryptedRequestData - Mijozning shifrlangan so'rov ma'lumotlari (mjson formatida).
     * @param {Buffer} sessionKey - Mijozning joriy session key'i.
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
            // Mijoza kelgan so'rovni o'sha sessionKey bilan deshifrlash
            requestData = this.decrypt(encryptedRequestData, sessionKey);
        } catch (error) {
            throw new Error('ModderSecureSDK: Failed to decrypt premium request data. ' + error.message);
        }

        console.log(`Handling premium request with pseudoKey: ${pseudoKey} and decrypted data:`, requestData);

        const premiumResponseContent = { message: "Premium data for user " + requestData.userId, report: "Full detailed report here..." };
        // Javobni ham o'sha sessionKey bilan shifrlash
        return this.encrypt(premiumResponseContent, sessionKey, requestData.request); // Asl request ID ni saqlash
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