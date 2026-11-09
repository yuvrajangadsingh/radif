import { describe, expect, it } from "vitest";
import { romanize } from "./romanize";

describe("romanize", () => {
  // The lines from the Nov 6 spike, where ICU's Any-Latin gave "tere nala
  // pi'ara" and "agara": the schwa rule is what this adds.
  it("spells Gurmukhi with the schwa rule", () => {
    expect(romanize("ਬਾਬੇ ਦੀ ਸਾਨੂੰ ਮਿਹਰ ਹੈ")).toBe("baabe di saanu mihar hai");
    expect(romanize("ਤੇਰੇ ਨਾਲ ਪਿਆਰ ਹੋ ਗਿਆ")).toBe("tere naal piaar ho gia");
  });

  it("spells Devanagari with the schwa rule", () => {
    expect(romanize("तू अगर मेरी हो जाए")).toBe("tu agar meri ho jaae");
    expect(romanize("तेरे बिना ज़िंदगी से कोई शिकवा तो नहीं")).toBe(
      "tere bina zindagi se koi shikva to nahin",
    );
  });

  it("spells lines from songs played in the app", () => {
    expect(romanize("बेताब-सा मोहब्बत का तु इन्क़लाब है")).toBe(
      "betaab-sa mohabbat ka tu inqalaab hai",
    );
    expect(romanize("तु अगर मेरी, ये उजाले तेरे")).toBe(
      "tu agar meri, ye ujaale tere",
    );
    expect(romanize("ਚੰਗਿਆ ਨਾ")).toBe("changia na");
  });

  it("spells Tamil, which keeps its vowels", () => {
    expect(romanize("நான் உன்னை காதலிக்கிறேன்")).toBe(
      "naan unnai kaadhalikkiren",
    );
    expect(romanize("வாழ்க்கை ஒரு பயணம்")).toBe("vaazhkkai oru payanam");
  });

  it("voices Tamil stops after a nasal and between vowels (QA N1)", () => {
    expect(romanize("அன்பே")).toBe("anbe");
    expect(romanize("கண்டு")).toBe("kandu");
    expect(romanize("நெஞ்சம்")).toBe("nenjam");
    expect(romanize("சிங்கம்")).toBe("singam");
    expect(romanize("பந்து")).toBe("pandhu");
    expect(romanize("பாடல்")).toBe("paadal");
    expect(romanize("மகன்")).toBe("magan");
    expect(romanize("வந்தேன்")).toBe("vandhen");
  });

  it("voices a Tamil க after ழ் or ர் unless doubled (QA r3 N2)", () => {
    expect(romanize("வாழ்க")).toBe("vaazhga");
    expect(romanize("மலர்கள்")).toBe("malargal");
    expect(romanize("தமிழ்க் கவிதை")).toBe("thamizhk kavidhai");
    expect(romanize("சேர்தல்")).toBe("serthal");
    expect(romanize("வளர்பிறை")).toBe("valarpirai");
    expect(romanize("பார்க்க")).toBe("paarkka");
    expect(romanize("வாழ்க்கை")).toBe("vaazhkkai");
  });

  it("keeps Tamil stops unvoiced when doubled or at the start", () => {
    expect(romanize("அக்கா")).toBe("akka");
    expect(romanize("அப்பா")).toBe("appa");
    expect(romanize("பட்டு")).toBe("pattu");
    expect(romanize("முன்பே வா என் அன்பே வா")).toBe("munbe vaa en anbe vaa");
  });

  it("keeps Tamil s, unvoiced clusters and ற clusters right", () => {
    expect(romanize("பாசம்")).toBe("paasam");
    expect(romanize("காசு")).toBe("kaasu");
    expect(romanize("ஆசை")).toBe("aasai");
    expect(romanize("இசை")).toBe("isai");
    expect(romanize("லக்ஷ்மி")).toBe("lakshmi");
    expect(romanize("காட்சி")).toBe("kaatchi");
    expect(romanize("பச்சை")).toBe("pachai");
    expect(romanize("மச்சான்")).toBe("machaan");
    expect(romanize("உச்சம்")).toBe("ucham");
    expect(romanize("அந்தப் பாடல்")).toBe("andhap paadal");
    expect(romanize("காற்று")).toBe("kaatru");
    expect(romanize("வெற்றி")).toBe("vetri");
    expect(romanize("தென்றல்")).toBe("thendral");
    expect(romanize("மின்சாரம்")).toBe("minsaaram");
    expect(romanize("அம்சம்")).toBe("amsam");
  });

  it("spells the Tamil aytham as h (QA r3 N1)", () => {
    expect(romanize("எஃகு")).toBe("ehku");
    expect(romanize("ஃ")).toBe("h");
    expect(romanize("ஃபேன்")).toBe("fen");
    expect(romanize("காஃபி")).toBe("kaafi");
  });

  it("spells Tamil loans from a word list (QA r3 N2)", () => {
    expect(romanize("மோகன்லால்")).toBe("mohanlal");
    expect(romanize("தீபம்")).toBe("deepam");
    expect(romanize("பக்தி")).toBe("bakthi");
    expect(romanize("டாக்டர் பஸ்")).toBe("doctor bus");
    expect(romanize("பக்\u200Dதி")).toBe("bakthi");
  });

  it("handles the schwa rule's edges", () => {
    expect(romanize("न")).toBe("na");
    expect(romanize("मित्र")).toBe("mitra");
    expect(romanize("प्यार")).toBe("pyaar");
    expect(romanize("धड़कन")).toBe("dharkan");
    expect(romanize("समझना")).toBe("samajhna");
  });

  it("handles nasals and the Gurmukhi doubling mark", () => {
    expect(romanize("कंबल")).toBe("kambal");
    expect(romanize("ਮੈਂ")).toBe("main");
    expect(romanize("ਛੱਡ")).toBe("chhadd");
    expect(romanize("ਪੱਕਾ")).toBe("pakka");
  });

  it("reads nukta letters whichever way they are encoded", () => {
    expect(romanize("ज़")).toBe("za");
    expect(romanize("ज़")).toBe("za");
    expect(romanize("ਸ਼ਾਮ")).toBe("shaam");
  });

  it("doesn't lose less common letters", () => {
    expect(romanize("ऋतु")).toBe("ritu");
    expect(romanize("कृपा")).toBe("kripa");
    expect(romanize("कॉफी")).toBe("kophi");
    expect(romanize("ஶ்ரீ")).toBe("shree");
    expect(romanize("ੲਹ")).toBe("ih");
  });

  it("applies a nukta to a doubled letter", () => {
    expect(romanize("ਇੱਜ਼ਤ")).toBe("izzat");
  });

  it("ignores joiners inside a word", () => {
    const plain = "र्य";
    expect(romanize(plain)).toBe("rya");
    expect(romanize("र\u200D्य")).toBe("rya");
    expect(romanize("र\u200C्य")).toBe("rya");
  });

  it("passes digits and danda through, and splits words on them", () => {
    const ram = "राम";
    const digits = "१२";
    expect(romanize(`${ram} ${digits}।`)).toBe(`raam ${digits}।`);
    expect(romanize(`${ram}${digits}${ram}`)).toBe(`raam${digits}raam`);
    expect(romanize(digits)).toBeNull();
  });

  it("never drops what it doesn't know", () => {
    expect(romanize("ॐ नमः")).toBe("om namah");
    expect(romanize("राम॰राम")).toBe("raam॰raam");
  });

  it("drops the final vowel after a cluster, unless it ends in r or y (QA M2)", () => {
    expect(romanize("वक़्त")).toBe("vaqt");
    expect(romanize("इश्क़")).toBe("ishq");
    expect(romanize("दर्द")).toBe("dard");
    expect(romanize("दोस्त")).toBe("dost");
    expect(romanize("मस्त")).toBe("mast");
    expect(romanize("शब्द")).toBe("shabd");
    expect(romanize("सख़्त")).toBe("sakht");
    expect(romanize("मित्र")).toBe("mitra");
    expect(romanize("सत्य")).toBe("satya");
    expect(romanize("चंद्र")).toBe("chandra");
    expect(romanize("फ़िक्र")).toBe("fikr");
    expect(romanize("उम्र")).toBe("umr");
    expect(romanize("सब्र")).toBe("sabr");
    expect(romanize("तुम हो तो वक़्त थमा है")).toBe("tum ho to vaqt thama hai");
  });

  it("keeps a final long vowel long when it is nasal (QA L2)", () => {
    expect(romanize("माँ")).toBe("maa");
    expect(romanize("हाँ")).toBe("haan");
    expect(romanize("में")).toBe("mein");
    expect(romanize("मैं")).toBe("main");
    expect(romanize("नहीं")).toBe("nahin");
    expect(romanize("आसमाँ")).toBe("aasmaan");
    expect(romanize("अरमाँ")).toBe("armaan");
    expect(romanize("कहाँ")).toBe("kahaan");
    expect(romanize("ਜਾਨਾਂ")).toBe("jaanaan");
  });

  it("keeps a final nasal oo long in Devanagari, short in Gurmukhi (N3)", () => {
    expect(romanize("हूँ")).toBe("hoon");
    expect(romanize("यूँ")).toBe("yoon");
    expect(romanize("क्यूँ")).toBe("kyoon");
    expect(romanize("तुमको मैं जीता हूँ")).toBe("tumko main jeeta hoon");
    expect(romanize("तू")).toBe("tu");
    expect(romanize("ਸਾਨੂੰ")).toBe("saanu");
  });

  it("puts a y glide between a short vowel and e (N3)", () => {
    expect(romanize("लिए")).toBe("liye");
    expect(romanize("दिए")).toBe("diye");
    expect(romanize("किए")).toBe("kiye");
    expect(romanize("गए")).toBe("gaye");
    expect(romanize("नए")).toBe("naye");
    expect(romanize("हुए")).toBe("huye");
    expect(romanize("धुएँ")).toBe("dhuyein");
    expect(romanize("मेरे लिए हो तुम")).toBe("mere liye ho tum");
    expect(romanize("प्यार")).toBe("pyaar");
    expect(romanize("यार")).toBe("yaar");
    expect(romanize("जाए")).toBe("jaae");
    expect(romanize("गई")).toBe("gai");
    expect(romanize("कोई")).toBe("koi");
  });

  it("spells a long ee before a bare aa as iya (N3)", () => {
    expect(romanize("ਕਾਲੀਆਂ ਗੱਡੀਆਂ")).toBe("kaaliyan gaddiyan");
    expect(romanize("ਕੁੜੀਆਂ")).toBe("kuriyan");
    expect(romanize("ਸਾਰੀਆਂ")).toBe("saariyan");
    expect(romanize("ਪਿਆਰ")).toBe("piaar");
    expect(romanize("ਜਾਨਾਂ")).toBe("jaanaan");
  });

  it("keeps a vowel letter standing alone long (QA r4)", () => {
    expect(romanize("आ आ आ")).toBe("aa aa aa");
    expect(romanize("ਆ")).toBe("aa");
    expect(romanize("ऊ")).toBe("oo");
    expect(romanize("पा")).toBe("pa");
    expect(romanize("ना")).toBe("na");
  });

  it("keeps other text in a mixed line", () => {
    expect(romanize("Baby तू (ooh), 2 बार")).toBe("Baby tu (ooh), 2 baar");
  });

  it("returns null for lines with nothing to romanize, Urdu included", () => {
    expect(romanize("Like it's the last night")).toBeNull();
    expect(romanize("پتا نہیں چلا، ہم بدل گئے")).toBeNull();
    expect(romanize("")).toBeNull();
  });
});
