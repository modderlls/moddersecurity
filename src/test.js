import { ModderSecureSDK } from './index.js';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto'; // <-- BU QATORNI QO'SHING!

dotenv.config();

const serverMasterKey = process.env.MODDERSECURE_SERVER_MASTER_KEY;
const premiumPseudoKey = process.env.MODDERSECURE_PREMIUM_PSEUDO_KEY;

if (!serverMasterKey) {
    console.error("Error: MODDERSECURE_SERVER_MASTER_KEY must be set in your .env file.");
    process.exit(1);
}

const sdk = new ModderSecureSDK(serverMasterKey);

try {
    const originalData = {
        userId: 123,
        username: 'modderboy',
        email: 'test@example.com',
        balance: 100.5
    };

    console.log('Original data:', originalData);

    const encryptedMjson = sdk.encrypt(originalData);
    console.log('Encrypted mjson (new format):', encryptedMjson);
    const decryptedData = sdk.decrypt(encryptedMjson);
    console.log('Decrypted data:', decryptedData);


    // --- PseudoKey (Premium mexanizm) testi ---
    if (!premiumPseudoKey) {
        console.warn("\nWarning: MODDERSECURE_PREMIUM_PSEUDO_KEY not set in .env. Skipping premium feature test.");
    } else {
        const premiumRequestData = { userId: 456, type: 'full_report' };
        const encryptedPremiumRequestPayload = sdk.encrypt(premiumRequestData);

        try {
            console.log('\nTesting Premium feature with valid PseudoKey...');
            const encryptedPremiumResponse = sdk.handlePremiumRequest(premiumPseudoKey, encryptedPremiumRequestPayload);
            console.log('Premium encrypted response (mjson):', encryptedPremiumResponse);

            const decryptedPremiumResponse = sdk.decrypt(encryptedPremiumResponse);
            console.log('Premium decrypted response:', decryptedPremiumResponse);

        } catch (error) {
            console.error('Premium feature test error:', error.message);
        }

        try {
            console.log('\nTesting Premium feature with invalid PseudoKey...');
            const invalidPseudoKey = 'WRONG_PSEUDO_KEY';
            sdk.handlePremiumRequest(invalidPseudoKey, encryptedPremiumRequestPayload);
        } catch (error) {
            console.error('Invalid PseudoKey test: Successfully caught error:', error.message);
        }
    }


    // --- is_secured: false holatini sinash ---
    console.log('\nTesting with is_secured: false data...');
    const unsecuredPayload = {
        request: randomBytes(8).toString('hex'), // <-- Endi bu yerda randomBytes ishlaydi
        id: "this_is_not_encrypted_data_but_a_plain_text_string",
        is_secured: false
    };
    const unsecuredMjsonString = `msc${JSON.stringify(unsecuredPayload)}`;
    try {
        sdk.decrypt(unsecuredMjsonString);
    } catch (error) {
        console.error('is_secured: false test: Successfully caught error:', error.message);
    }

    // Noto'g'ri mjson formatini sinash (prefix yo'q)
    try {
        console.log('\nTesting with invalid mjson format (missing prefix)...');
        const plainJsonMjsonObj = JSON.parse(encryptedMjson.substring(3));
        sdk.decrypt(JSON.stringify(plainJsonMjsonObj));
    } catch (error) {
        console.error('Invalid mjson format test (missing prefix): Successfully caught error:', error.message);
    }

    // Noto'g'ri mjson formatini sinash (buzilgan JSON)
    try {
        console.log('\nTesting with invalid mjson format (malformed JSON)...');
        sdk.decrypt('msc{"request":"abc","id":"123","is_secured":true,'); // Buzilgan JSON
    } catch (error) {
        console.error('Invalid mjson format test (malformed JSON): Successfully caught error:', error.message);
    }

    // --- Boshqa xatolarni tekshirish (oldingidek) ---

    // Ma'lumot o'zgartirilgan holatni sinash (mjson formatining "id" qismini buzamiz)
    console.log('\nTesting with tampered mjson "id" field...');
    const originalMjsonObj = JSON.parse(encryptedMjson.substring(3));
    const tamperedEncryptedId = originalMjsonObj.id.slice(0, -5) + 'abcde';
    const tamperedMjsonObj = { ...originalMjsonObj, id: tamperedEncryptedId };
    const tamperedMjsonString = `msc${JSON.stringify(tamperedMjsonObj)}`;

    try {
        sdk.decrypt(tamperedMjsonString);
    } catch (error) {
        console.error('Tampered mjson "id" test: Successfully caught error:', error.message);
    }

    // Noto'g'ri kalit bilan deshifrlashni sinash
    console.log('\nTesting with wrong master key...');
    const wrongMasterKey = 'another_wrong_master_key_for_testing_32_chars_min';
    const wrongSdk = new ModderSecureSDK(wrongMasterKey);
    try {
        wrongSdk.decrypt(encryptedMjson);
    } catch (error) {
        console.error('Wrong master key test: Successfully caught error:', error.message);
    }


} catch (e) {
    console.error('An error occurred:', e.message);
}