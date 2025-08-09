import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

class ModderSecureSDK {
    constructor(serverMasterKeyString) {
        if (!serverMasterKeyString || typeof serverMasterKeyString !== 'string') {
            throw new Error('ModderSecureSDK: Server Master Key string is required.');
        }

        const masterKeySalt = Buffer.from(process.env.MODDERSECURE_MASTER_SALT || 'default_master_salt_for_secure_key_derivation', 'utf8');
        this.aesKey = scryptSync(serverMasterKeyString, masterKeySalt, 32);

        this.algorithm = 'aes-256-gcm';
    }

    /**
     * Ma'lumotlarni shifrlash va yangi "mjson" formatida qaytarish.
     * @param {Object} data - Shifrlanadigan JavaScript obyekti.
     * @returns {string} Yangi "mjson" formatida shifrlangan string.
     */
    encrypt(data) {
        const iv = randomBytes(12);
        const cipher = createCipheriv(this.algorithm, this.aesKey, iv);

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        const encryptedPayloadString = `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;

        const mjsonResponse = {
            request: randomBytes(8).toString('hex'),
            id: encryptedPayloadString,
            is_secured: true // Shifrlangan ma'lumot har doim is_secured: true bo'ladi
        };

        return `msc${JSON.stringify(mjsonResponse)}`;
    }

    /**
     * Yangi "mjson" formatidagi shifrlangan ma'lumotlarni deshifrlash.
     * @param {string} mjsonString - Yangi "mjson" formatida shifrlangan string.
     * @returns {Object} Deshifrlangan JavaScript obyekti.
     * @throws {Error} Agar deshifrlash muvaffaqiyatsiz bo'lsa yoki format noto'g'ri bo'lsa.
     */
    decrypt(mjsonString) {
        if (!mjsonString || typeof mjsonString !== 'string') {
            throw new Error('ModderSecureSDK: Input must be a string.');
        }

        if (!mjsonString.startsWith('msc{') || !mjsonString.endsWith('}')) {
            // Agar msc prefiksi yoki oxirgi } yo'q bo'lsa, bu shifrlangan emas.
            // Bu yerda siz is_secured: false yoki noto'g'ri JSONni kiritishni nazarda tutganingizdek.
            // Bunday holda, biz uni to'g'ridan-to'g'ri rad etamiz.
            throw new Error('ModderSecureSDK: Invalid mjson format. Data is not properly secured or tampered with prefix/suffix.');
        }

        const jsonString = mjsonString.substring(3);

        let mjsonObject;
        try {
            mjsonObject = JSON.parse(jsonString);
        } catch (error) {
            throw new Error('ModderSecureSDK: Failed to parse mjson string. Invalid JSON format.');
        }

        // is_secured flagini tekshirish
        if (mjsonObject.is_secured === false) {
            // Agar client ataylab is_secured: false deb belgilagan bo'lsa,
            // biz buni shifrlanmagan yoki to'g'ri ishlashga mo'ljallanmagan deb hisoblaymiz.
            throw new Error('ModderSecureSDK: Data explicitly marked as not secured (is_secured: false).');
        }

        if (!mjsonObject.id || typeof mjsonObject.id !== 'string') {
            throw new Error('ModderSecureSDK: Invalid mjson structure. Missing or invalid "id" field.');
        }

        const encryptedPayloadString = mjsonObject.id;

        const parts = encryptedPayloadString.split(':');
        if (parts.length !== 3) {
            throw new Error('ModderSecureSDK: Invalid encrypted payload format within mjson. (IV:encrypted:authTag expected)');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const authTag = Buffer.from(parts[2], 'hex');

        const decipher = createDecipheriv(this.algorithm, this.aesKey, iv);
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
     * PseudoKey bilan bog'liq maxsus funksiyalar (Premium mijozlar uchun).
     * @param {string} pseudoKey - Premium mijoz tomonidan taqdim etilgan pseudoKey.
     * @param {string} encryptedRequestData - Mijozning shifrlangan so'rov ma'lumotlari (mjson formatida).
     * @returns {string} Qayta ishlangan va shifrlangan javob (mjson formatida).
     */
    handlePremiumRequest(pseudoKey, encryptedRequestData) {
        if (!this.isValidPseudoKey(pseudoKey)) {
            throw new Error('ModderSecureSDK: Invalid pseudoKey for premium access.');
        }

        let requestData;
        try {
            requestData = this.decrypt(encryptedRequestData); // mjson formatidagi so'rovni ochish
        } catch (error) {
            throw new Error('ModderSecureSDK: Failed to decrypt premium request data. ' + error.message);
        }

        console.log(`Handling premium request with pseudoKey: ${pseudoKey} and decrypted data:`, requestData);

        const premiumResponseContent = { message: "Premium data for user " + requestData.userId, report: "Full detailed report here..." };
        return this.encrypt(premiumResponseContent); // Javobni mjson formatida shifrlash
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