// คน B: แก้ชื่อ คำอธิบาย รูป และแต้มด้านล่าง แล้วรีเฟรชเว็บ
window.MONSTERS.push({
  id: "monster-b", // ไม่ต้องเปลี่ยน ID
  name: "จอห์นซีน่า",
  description: "HIS NAME IS JOHN CENA",
  image: "assets/john-cena.png", // ใช้ชื่อรูปไม่ซ้ำกับเพื่อน
  skill: "shield", // strike | poison | heal | shield (ทุก 3 ตาตัวเอง)
  trait: "regeneration", // none | thorns | regeneration | berserk
  stats: {
    // งบรวมสูงสุด 100 แต้ม ค่าเกินเพดานจะถูกลดในเว็บ
    hp: 50, // สูงสุด 50
    attack: 40,
    defense: 40,
    speed: 40, // attack / defense / speed สูงสุดอย่างละ 40
    critical: 0, // สูงสุด 25
    lifesteal: 20, // สูงสุด 20
    evasion: 20, // สูงสุด 20
    armorPierce: 30 // สูงสุด 30
  }
});
