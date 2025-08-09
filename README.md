# MdSecure SDK

![MdSecure Logo (Placeholder - siz bu yerga o'z logoyingizni qo'shishingiz mumkin)](https://via.placeholder.com/150/0000FF/FFFFFF?text=MdSecure)

ModderSecure SDK - bu backend va API aloqalari uchun mustahkam AES-256 GCM shifrlash/deshifrlashni ta'minlaydigan kuchli Node.js kutubxonasi. U ma'lumotlar maxfiyligini oshirish, web-skrepingga qarshi kurashish va API xavfsizligini ta'minlash uchun mo'ljallangan.

## ✨ Xususiyatlar

*   **AES-256 GCM shifrlash:** Ma'lumotlarning maxfiyligi va butunligini ta'minlaydi.
*   **Mustahkam kalit hosil qilish:** `scryptSync` yordamida `master key`dan xavfsiz kalitlar yaratish.
*   **"msc" formatidagi shifrlangan ma'lumotlar:** API javoblarini JSONga o'xshash, ammo shifrlangan va tahlil qilish qiyin bo'lgan formatda taqdim etadi.
    *   Har bir shifrlangan javob noyob `request` identifikatori va `is_secured: true` flagini o'z ichiga oladi.
*   **Noto'g'ri/shifrlanmagan ma'lumotlarni aniqlash:** `is_secured: false` bo'lgan yoki format buzilgan so'rovlarni tezda rad etish.
*   **Premium PseudoKey mexanizmi:** Yuqori darajadagi xavfsizlik va xususiyatlar uchun maxsus foydalanuvchilar/loyiqalarga kirishni boshqarish imkoniyati.
*   **Server tomonida ishlash:** Asosiy shifrlash kalitlari hech qachon mijoz tomoniga oshkor qilinmaydi.

## 🚀 O'rnatish

MdSecure SDK'ni loyihangizga qo'shish uchun npm dan foydalaning:

```bash
npm install mdsecure