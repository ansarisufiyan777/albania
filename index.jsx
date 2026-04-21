import { useState, useEffect, useRef } from "react";

const bookings = [
  { type: "flight", label: "Outbound", detail: "W45112 · May 2 · FKB 21:00 → TIA 23:05", conf: "VMG83J", extra: "4 passengers · Wizz Air · €322.74 total" },
  { type: "flight", label: "Return", detail: "W45111 · May 9 · TIA 18:05 → FKB 20:25", conf: "VMG83J", extra: "4 passengers · Wizz Air" },
  { type: "car", label: "Rental Car — Fiat Panda 5dr A/C", detail: "May 3 (10:00) – May 9 (15:00) · €56.99 paid + €49.00 on arrival = €106 total", conf: "CJT-202532255", extra: "RENTAL24 · Tirana Airport · Exit arrivals, turn right 50m, left 30m · +355 69 847 8479", voucherUrl: "/voucher_202532255.pdf" },
  { type: "hotel", label: "Aerostay Hotel", detail: "May 2–3 · 1 night · €45", conf: "6691.888.757", extra: "Rruga e Aeroportit, 1000 Rinas · +355 68 819 2835", mapUrl: "https://maps.google.com/?q=Aerostay+Hotel+Rinas+Albania" },
  { type: "hotel", label: "Bujtina Veritos", detail: "May 3–5 · 2 nights · €92.22", conf: "6075.108.573", breakfast: true, extra: "Rruga Andon Sinjari, 5001 Berat · +49 174 6723003 · Cash only", mapUrl: "https://maps.google.com/?q=Bujtina+Veritos+Berat+Albania" },
  { type: "hotel", label: "Apart-Hotel Lili2", detail: "May 5–8 · 3 nights · €123.94 total", conf: "5312.498.819 (May 5–7) · 5635.491.318 (May 7–8)", extra: "Rruga Butrinti, 9701 Sarandë · +355 68 208 5115 · Check-out May 8 by 10:00", mapUrl: "https://maps.google.com/?q=Apart+Hotel+Lili2+Sarande+Albania", voucherUrl: "/booking_sarande_may7.pdf" },
  { type: "hotel", label: "Hotel Akropoli", detail: "May 8–9 · 1 night · €53.87", conf: "5445.732.190", breakfast: true, extra: "PIN: 0419 · Deluxe Triple Room · Rruga Ali Bakiu, Tirana · +355 4 241 0414 · Free parking · Check-in 12:00–13:00 · Check-out 10:00–11:00", mapUrl: "https://maps.google.com/?q=Hotel+Akropoli+Tirana+Albania", voucherUrl: "/booking_tirana_may8.pdf" },
];

const dotColors = { flight: "#D85A30", travel: "#378ADD", food: "#1D9E75", activity: "#7F77DD", hotel: "#EF9F27", car: "#2E7D32" };

// Hanafi prayer times for Tirana, Albania (Muslim World League, Hanafi Asr)
// Source: al-habib.info — May 2–9, 2026
const prayerTimes = {
  "May 2":  { fajr: "03:54", dhuhr: "12:41", asr: "16:31", maghrib: "19:40", isha: "21:20" },
  "May 3":  { fajr: "03:52", dhuhr: "12:41", asr: "16:32", maghrib: "19:41", isha: "21:21" },
  "May 4":  { fajr: "03:50", dhuhr: "12:41", asr: "16:32", maghrib: "19:42", isha: "21:23" },
  "May 5":  { fajr: "03:46", dhuhr: "12:41", asr: "16:32", maghrib: "19:43", isha: "21:24" },
  "May 6":  { fajr: "03:45", dhuhr: "12:41", asr: "16:33", maghrib: "19:44", isha: "21:26" },
  "May 7":  { fajr: "03:43", dhuhr: "12:41", asr: "16:33", maghrib: "19:45", isha: "21:27" },
  "May 8":  { fajr: "03:41", dhuhr: "12:41", asr: "16:33", maghrib: "19:46", isha: "21:29" },
  "May 9":  { fajr: "03:39", dhuhr: "12:41", asr: "16:33", maghrib: "19:47", isha: "21:31" },
};

// Photos keyed by event label — real images scraped from Albania travel blogs
// Sources: travelrebels.com, lovealbania.al, findalbania.com, thepassportcouple.com
const photoMap = {
  "Old Town walk & Mangalem quarter": [
    "https://travelrebels.com/wp-content/uploads/2025/07/Mangalem-berat--533x800.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/Mangalem-berat-albanie-533x800.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/wat-te-doen-in-berat-albanie-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/kalaja-canva-2.jpg",
  ],
  "Evening stroll along the Osum riverbank": [
    "https://travelrebels.com/wp-content/uploads/2025/07/tips-berat-albanie.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/DSC_0039.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/tips-voor-berat--533x800.jpg",
  ],
  "Osumi Canyon viewpoint": [
    "https://travelrebels.com/wp-content/uploads/2025/08/Vrima-e-Nuses-Viewpoint-osumi-canyon.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/kalaja-canva-1.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/tips-berat-albanie.jpg",
  ],
  "Gorica Bridge & riverside walk": [
    "https://lovealbania.al/wp-content/uploads/2025/06/DSC_0039.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/Mangalem-berat--533x800.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/albanees-eten-berat-533x800.jpg",
  ],
  "Berat Castle walk & views": [
    "https://lovealbania.al/wp-content/uploads/2025/06/kalaja-canva.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/kalaja-canva-1.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/kalaja-canva-2.jpg",
    "https://thepassportcouple.com/wp-content/uploads/2025/04/berat-what-to-see-scaled.webp",
  ],
  "Evening walk — Mangalem quarter at sunset": [
    "https://travelrebels.com/wp-content/uploads/2025/07/Mangalem-berat-albanie-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/kalaja-canva-2.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/tips-voor-berat--533x800.jpg",
  ],
  "Quick stop in Vlorë": [
    "https://lovealbania.al/wp-content/uploads/2025/03/unique-things-to-do-in-saranda.jpeg",
    "https://travelrebels.com/wp-content/uploads/2025/08/Sarande-albanie-1-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/03/Saranda-Town.jpg",
  ],
  "Sarandë bay & promenade": [
    "https://lovealbania.al/wp-content/uploads/2025/03/Saranda-Town.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/sarande-albanie.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/tips-Sarande-albanie-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/03/unique-things-to-do-in-saranda.jpeg",
  ],
  "Beach time at Sarandë city beach": [
    "https://travelrebels.com/wp-content/uploads/2025/08/sarande-albanie.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/03/Saranda-Town.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/Sarande-of-Ksamil-albanie-533x800.jpg",
  ],
  "Hand of Ksamil": [
    "https://lovealbania.al/wp-content/uploads/2025/06/ksamil-1.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/ksamil-3.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/ksamil-albanie-tips.jpg",
  ],
  "Augustus Beach — full morning swim": [
    "https://lovealbania.al/wp-content/uploads/2025/06/ksamil-3.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/wat-te-doen-in-ksamil-albanie-533x800.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/ksamil-albanie-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/ksamil-1.jpg",
  ],
  "Boat trip to Ksamil islands": [
    "https://travelrebels.com/wp-content/uploads/2025/08/ksamil-albanie-tips.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/09/Untitled-design-1-1-768x614-1.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/dagtrip-naar-ksamil-vanuit-sarande-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/ksamil-3.jpg",
  ],
  "Sarandë waterfront walk & ice cream": [
    "https://lovealbania.al/wp-content/uploads/2025/03/Saranda-Town.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/tips-Sarande-albanie-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/03/unique-things-to-do-in-saranda.jpeg",
  ],
  "Sunset from the promenade": [
    "https://travelrebels.com/wp-content/uploads/2025/08/Sarande-albanie-1-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/03/Saranda-Town.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/is-sarande-of-ksamil-leuker--533x800.jpg",
  ],
  "The Blue Eye natural spring": [
    "https://lovealbania.al/wp-content/uploads/2025/06/syri-canva-1.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/syri-canva-2.jpg",
    "https://findalbania.com/wp-content/uploads/2025/05/Blue-Eye-FindAlbania-Drone-View-1024x542.jpg",
    "https://findalbania.com/wp-content/uploads/2025/06/Blue-Eye-FindAlbania-scaled.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/Finiqi-dhe-Syri-i-Kalter-tibonews.webp",
  ],
  "Lëkurësi Castle & panoramic views": [
    "https://lovealbania.al/wp-content/uploads/2025/03/Saranda-Town.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/sarande-albanie.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/03/unique-things-to-do-in-saranda.jpeg",
  ],
  "Free beach time": [
    "https://lovealbania.al/wp-content/uploads/2025/06/ksamil-3.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/ksamil-albanie-tips-1-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/06/ksamil-1.jpg",
  ],
  "Evening promenade walk": [
    "https://lovealbania.al/wp-content/uploads/2025/03/Saranda-Town.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/Sarande-albanie-1-533x800.jpg",
  ],
  "Mosque of Namazgah": [
    "https://lovealbania.al/wp-content/uploads/2025/09/Untitled-design-7-edited.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/01/40_Tirana-Castle-Justiniani-Fortress.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/Tips-voor-Tirana-Albanie.jpg",
  ],
  "Skanderbeg Square": [
    "https://lovealbania.al/wp-content/uploads/2025/09/Untitled-design-7-edited.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/wat-te-doen-in-tirana-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/08/Untitled-21-x-18-cm-21-x-18-cm-3-2.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/Tips-voor-Tirana-Albanie.jpg",
  ],
  "Clock Tower — climb to the top": [
    "https://lovealbania.al/wp-content/uploads/2025/05/Untitled-design-edited.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/wat-te-doen-in-tirana-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/01/40_Tirana-Castle-Justiniani-Fortress.jpg",
  ],
  "Tirana Lake Park": [
    "https://lovealbania.al/wp-content/uploads/2025/08/Untitled-21-x-18-cm-21-x-18-cm-3-2.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/leuke-wijken-tirana-533x800.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/fietsen-Tirana-533x800.jpg",
  ],
  "Blloku district — street cafés & city vibes": [
    "https://travelrebels.com/wp-content/uploads/2025/08/Blloku-tirana-533x800.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/08/leuke-wijken-tirana-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/09/Untitled-design-7-edited.jpg",
  ],
  "Evening walk — Skanderbeg Square at dusk": [
    "https://travelrebels.com/wp-content/uploads/2025/08/wat-te-doen-in-tirana-533x800.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/09/Untitled-design-7-edited.jpg",
    "https://travelrebels.com/wp-content/uploads/2025/07/Tips-voor-Tirana-Albanie.jpg",
  ],
  "Krujë Castle & Ottoman bazaar": [
    "https://lovealbania.al/wp-content/uploads/2025/05/kruje-canva.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/09/kruje.albania.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/05/Kruje-canva-1.jpg",
    "https://lovealbania.al/wp-content/uploads/2025/05/pazari-vjeter-canva.jpg",
  ],
};

function PhotoCarousel({ label }) {
  const photos = photoMap[label];
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!photos || photos.length === 0) return null;

  const prev = (e) => { e.stopPropagation(); setLoaded(false); setErrored(false); setIdx(i => (i - 1 + photos.length) % photos.length); };
  const next = (e) => { e.stopPropagation(); setLoaded(false); setErrored(false); setIdx(i => (i + 1) % photos.length); };

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
        <div style={{ position: "relative", width: "100%", borderRadius: 10, overflow: "hidden", background: "#e8e8e8", lineHeight: 0, boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
          onClick={e => e.stopPropagation()}>
          {!loaded && !errored && (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 13 }}>Loading…</div>
          )}
          {errored && (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#aaa", fontSize: 13 }}>📷 Photo unavailable</div>
          )}
          <img
            key={photos[idx]}
            src={photos[idx]}
            alt={label}
            onLoad={() => { setLoaded(true); setErrored(false); }}
            onError={() => { setLoaded(true); setErrored(true); }}
            style={{ width: "100%", height: loaded && !errored ? 220 : 0, objectFit: "cover", display: "block" }}
          />
          {photos.length > 1 && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between", pointerEvents: "none" }}>
              <button onClick={prev} style={{ pointerEvents: "all", background: "rgba(0,0,0,0.4)", color: "#fff", border: "none", borderRadius: "0 6px 6px 0", padding: "10px 14px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>‹</button>
              <button onClick={next} style={{ pointerEvents: "all", background: "rgba(0,0,0,0.4)", color: "#fff", border: "none", borderRadius: "6px 0 0 6px", padding: "10px 14px", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>›</button>
            </div>
          )}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-between", background: "linear-gradient(transparent, rgba(0,0,0,0.55))", padding: "20px 10px 7px", pointerEvents: "none" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", fontStyle: "italic" }}>📸 {label}</span>
            {photos.length > 1 && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "1px 7px" }}>{idx + 1}/{photos.length}</span>}
          </div>
        </div>
    </div>
  );
}

const typeStyles = {
  flight: { bg: "#E8F2FC", text: "#0C447C", border: "#B8D4F0" },
  hotel:  { bg: "#FEF3E2", text: "#7A4A10", border: "#F5D9A0" },
  car:    { bg: "#EDFAEE", text: "#1B5E20", border: "#A5D6A7" },
  todo:   { bg: "#FEF0EF", text: "#B03030", border: "#F5C2C2" },
};

const initialDays = [
  {
    date: "May 2 · Sat", title: "Departure & Arrival", badge: "Arrival day", badgeColor: "#FEF3E2", badgeText: "#7A4A10",
    prayerKey: "May 2", drive: null,
    events: [
      { time: "21:00", type: "flight", label: "Depart Karlsruhe (FKB) · W45112" },
      { time: "23:05", type: "flight", label: "Arrive Tirana (TIA)" },
      { time: "23:30", type: "hotel", label: "Check in — Aerostay Hotel, Rinas", sub: "Near airport · 1 night", mapUrl: "https://maps.google.com/?q=Aerostay+Hotel+Rinas+Albania" },
    ]
  },
  {
    date: "May 3 · Sun", title: "Drive to Berat", badge: "Drive day", badgeColor: "#E8F2FC", badgeText: "#0C447C",
    prayerKey: "May 3", drive: "1h 55min",
    events: [
      { time: "09:00", type: "food", label: "Slow breakfast at hotel", sub: "Late night arrival — let kids wake up naturally" },
      { time: "10:00", type: "travel", label: "Collect rental car — RENTAL24, Tirana Airport", sub: "Exit arrivals, turn right 50m, turn left 30m · Fiat Panda · Booking CJT-202532255 · Pay €49 on arrival", mapUrl: "https://maps.google.com/?q=RENTAL24+Tirana+Airport+Albania" },
      { time: "10:30", type: "travel", label: "Check out & drive to Berat", sub: "~1h 55min · 117 km direct · A2 highway", mapUrl: "https://maps.google.com/maps/dir/Rinas+Albania/Berat+Albania" },
      { time: "12:30", type: "food", label: "Lunch stop en route or in Berat" },
      { time: "13:30", type: "hotel", label: "Check in — Bujtina Veritos, Berat", sub: "2 nights · breakfast included · early check-in worth requesting", mapUrl: "https://maps.google.com/?q=Bujtina+Veritos+Berat+Albania" },
      { time: "14:30", type: "activity", label: "Old Town walk & Mangalem quarter", sub: "Easy flat streets · good for pushchair", mapUrl: "https://maps.google.com/?q=Mangalem+Quarter+Berat+Albania" },
      { time: "17:00", type: "activity", label: "Rest at hotel / kids nap" },
      { time: "18:30", type: "activity", label: "Evening stroll along the Osum riverbank", sub: "Golden hour light on the white Ottoman houses — stunning", mapUrl: "https://maps.google.com/?q=Berat+Riverbank+Albania" },
      { time: "20:30", type: "food", label: "Dinner — Temi Albanian Food", sub: "⭐ 4.9/5 · 1,275 reviews · halal options · stuffed peppers, moussaka, pan meatballs · cosy castle district · homemade everything", mapUrl: "https://maps.google.com/?q=Temi+Albanian+Food+Berat" },
    ]
  },
  {
    date: "May 4 · Mon", title: "Berat & Osumi Canyon", badge: "Explore day", badgeColor: "#EEEDFE", badgeText: "#3C3489",
    prayerKey: "May 4", drive: "3h",
    events: [
      { time: "08:00", type: "food", label: "Breakfast at hotel (included)" },
      { time: "09:00", type: "travel", label: "Drive to Osumi Canyon", sub: "~1h 30min · 50 km southeast toward Çorovodë", mapUrl: "https://maps.google.com/maps/dir/Berat+Albania/Osumi+Canyon+Albania" },
      { time: "10:30", type: "activity", label: "Osumi Canyon viewpoint", sub: "Park & look — no hiking needed · dramatic gorge views · 30–45 min · Yusuf will love the wow factor", mapUrl: "https://maps.google.com/?q=Osumi+Canyon+Albania" },
      { time: "11:15", type: "travel", label: "Drive back to Berat", sub: "~1h 30min", mapUrl: "https://maps.google.com/maps/dir/Osumi+Canyon+Albania/Berat+Albania" },
      { time: "13:00", type: "food", label: "Lunch in Berat" },
      { time: "14:30", type: "activity", label: "Gorica Bridge & riverside walk", sub: "Flat & easy · kids can run", mapUrl: "https://maps.google.com/?q=Gorica+Bridge+Berat+Albania" },
      { time: "16:00", type: "activity", label: "Berat Castle walk & views", sub: "Free entry · UNESCO site · main paths are pushchair-accessible · no museums", mapUrl: "https://maps.google.com/?q=Berat+Castle+Albania" },
      { time: "18:30", type: "activity", label: "Evening walk — Mangalem quarter at sunset", sub: "Best light of the day on the UNESCO houses", mapUrl: "https://maps.google.com/?q=Mangalem+Quarter+Berat+Albania" },
      { time: "20:30", type: "food", label: "Dinner — Chef Toska Restaurant", sub: "⭐ 4.5/5 · explicitly halal · traditional Albanian + grilled dishes · St Antipatrea · book ahead", mapUrl: "https://maps.google.com/?q=Chef+Toska+Restaurant+Berat+Albania" },
    ]
  },
  {
    date: "May 5 · Tue", title: "Berat → Vlorë → Sarandë", badge: "Drive day", badgeColor: "#E8F2FC", badgeText: "#0C447C",
    prayerKey: "May 5", drive: "3h 30min",
    events: [
      { time: "07:30", type: "food", label: "Breakfast at hotel (included)" },
      { time: "08:30", type: "travel", label: "Check out & drive via Fier → Vlorë → Sarandë", sub: "~3h 30min · 219 km · flat inland highway · no mountain roads", mapUrl: "https://maps.google.com/maps/dir/Berat+Albania/Fier+Albania/Vlore+Albania/Sarande+Albania" },
      { time: "10:15", type: "activity", label: "Quick stop in Vlorë", sub: "Stretch legs · coastal town · grab a coffee · 15–20 min stop", mapUrl: "https://maps.google.com/?q=Vlore+Albania" },
      { time: "11:00", type: "food", label: "Lunch in Vlorë", sub: "~1h 45min left to Sarandë after Vlorë" },
      { time: "12:30", type: "travel", label: "Continue drive to Sarandë", sub: "~1h 45min remaining after Vlorë" },
      { time: "14:15", type: "hotel", label: "Check in — Apart-Hotel Lili2, Sarandë", sub: "2 nights · arriving after coast drive", mapUrl: "https://maps.google.com/?q=Apart+Hotel+Lili2+Sarande+Albania" },
      { time: "15:30", type: "activity", label: "Sarandë bay & promenade", sub: "Flat, wide, great for kids", mapUrl: "https://maps.google.com/?q=Sarande+Promenade+Albania" },
      { time: "17:30", type: "activity", label: "Beach time at Sarandë city beach", sub: "Right on the promenade · kids in the water before dinner", mapUrl: "https://maps.google.com/?q=Sarande+Beach+Albania" },
      { time: "20:30", type: "food", label: "Dinner — Sophra Restaurant", sub: "⭐ Halal-certified · all meat from certified halal butcher · Albanian & Mediterranean · T-bone, grilled fish, byrek · breezy veranda", mapUrl: "https://maps.google.com/?q=Sophra+Restaurant+Sarande+Albania" },
    ]
  },
  {
    date: "May 6 · Wed", title: "Ksamil Beach Day", badge: "Beach day", badgeColor: "#E1F5EE", badgeText: "#085041",
    prayerKey: "May 6", drive: "30min",
    events: [
      { time: "08:00", type: "food", label: "Breakfast at apartment" },
      { time: "09:00", type: "travel", label: "Drive to Ksamil", sub: "~15 min south", mapUrl: "https://maps.google.com/maps/dir/Sarande+Albania/Ksamil+Albania" },
      { time: "09:15", type: "activity", label: "Hand of Ksamil", sub: "Go early to beat queues · quick stop", mapUrl: "https://maps.google.com/?q=Hand+of+Ksamil+Albania" },
      { time: "09:45", type: "activity", label: "Augustus Beach — full morning swim", sub: "Calm shallow water · ideal for toddlers · €10 sunbeds · no loud music", mapUrl: "https://maps.google.com/?q=Augustus+Beach+Ksamil+Albania" },
      { time: "13:00", type: "food", label: "Lunch in Ksamil" },
      { time: "14:30", type: "activity", label: "Boat trip to Ksamil islands", sub: "€5–10pp · 10 min ride · shallow clear water on the islands · Yusuf will love it", mapUrl: "https://maps.google.com/?q=Ksamil+Islands+Albania" },
      { time: "16:00", type: "travel", label: "Drive back to Sarandë", sub: "~15 min", mapUrl: "https://maps.google.com/maps/dir/Ksamil+Albania/Sarande+Albania" },
      { time: "16:30", type: "activity", label: "Sarandë waterfront walk & ice cream", sub: "Flat promenade · easy with pushchair", mapUrl: "https://maps.google.com/?q=Sarande+Promenade+Albania" },
      { time: "18:30", type: "activity", label: "Sunset from the promenade", sub: "Ionian Sea sunset — one of the best spots on the trip" },
      { time: "20:30", type: "food", label: "Dinner — Sophra Restaurant", sub: "⭐ Halal-certified · grilled seabass, meatballs, octopus salad · book a veranda table for the sea breeze", mapUrl: "https://maps.google.com/?q=Sophra+Restaurant+Sarande+Albania" },
    ]
  },
  {
    date: "May 7 · Thu", title: "Blue Eye & Sarandë", badge: "Beach day", badgeColor: "#E1F5EE", badgeText: "#085041",
    prayerKey: "May 7", drive: "1h 15min",
    events: [
      { time: "08:00", type: "food", label: "Breakfast at apartment" },
      { time: "09:00", type: "travel", label: "Drive to The Blue Eye", sub: "~35 min · 22 km · SH99 road toward Gjirokastër", mapUrl: "https://maps.google.com/maps/dir/Sarande+Albania/Blue+Eye+Albania" },
      { time: "09:35", type: "activity", label: "The Blue Eye natural spring", sub: "Short easy walk · crystal turquoise spring · kids love it · entry fee ~€4", mapUrl: "https://maps.google.com/?q=Blue+Eye+Spring+Albania" },
      { time: "10:45", type: "travel", label: "Drive back to Sarandë", sub: "~35 min", mapUrl: "https://maps.google.com/maps/dir/Blue+Eye+Albania/Sarande+Albania" },
      { time: "11:30", type: "activity", label: "Lëkurësi Castle & panoramic views", sub: "10 min drive above Sarandë · sweeping bay views", mapUrl: "https://maps.google.com/?q=Lekuresi+Castle+Sarande+Albania" },
      { time: "13:00", type: "food", label: "Lunch in Sarandë" },
      { time: "14:30", type: "activity", label: "Free beach time", sub: "Kids swim · relax · long afternoon" },
      { time: "17:30", type: "hotel", label: "Still at Apart-Hotel Lili2", sub: "Same room · no check-in needed · ⚠ check-out tomorrow by 10:00", mapUrl: "https://maps.google.com/?q=Apart+Hotel+Lili2+Sarande+Albania" },
      { time: "19:00", type: "activity", label: "Evening promenade walk", sub: "Sarandë is lovely at this hour · grab an ice cream" },
      { time: "20:30", type: "food", label: "Dinner — Sophra Restaurant", sub: "⭐ Halal-certified · last night in Sarandë · try the seafood pasta or grilled fish · indoor or veranda seating", mapUrl: "https://maps.google.com/?q=Sophra+Restaurant+Sarande+Albania" },
    ]
  },
  {
    date: "May 8 · Fri", title: "Sarandë → Tirana", badge: "Drive day", badgeColor: "#E8F2FC", badgeText: "#0C447C",
    prayerKey: "May 8", drive: "4h 10min",
    events: [
      { time: "06:30", type: "food", label: "Quick breakfast & check out", sub: "Check-out deadline 10:00 · Apart-Hotel Lili2" },
      { time: "07:00", type: "travel", label: "Drive to Tirana", sub: "~4h 10min · 251 km · straight north via Gjirokastër & Fier", mapUrl: "https://maps.google.com/maps/dir/Sarande+Albania/Tirana+Albania" },
      { time: "11:15", type: "hotel", label: "Check in — Hotel Akropoli, Tirana", sub: "Conf: 5445.732.190 · PIN: 0419 · Check-in from 12:00 · Free parking on site · Rruga Ali Bakiu", mapUrl: "https://maps.google.com/?q=Hotel+Akropoli+Tirana+Albania" },
      { time: "11:30", type: "activity", label: "Mosque of Namazgah", sub: "Largest mosque in the Balkans · city center · beautiful architecture", mapUrl: "https://maps.google.com/?q=Mosque+of+Namazgah+Tirana" },
      { time: "12:15", type: "food", label: "Lunch in Tirana center" },
      { time: "13:30", type: "activity", label: "Skanderbeg Square", sub: "Large open square · easy for kids to run around", mapUrl: "https://maps.google.com/?q=Skanderbeg+Square+Tirana+Albania" },
      { time: "14:00", type: "activity", label: "Clock Tower — climb to the top", sub: "Small tower · ~100 steps · Yusuf will love it · right next to the square", mapUrl: "https://maps.google.com/?q=Clock+Tower+Tirana+Albania" },
      { time: "14:45", type: "activity", label: "Tirana Lake Park", sub: "Kids playground & lakeside walk · great for Maryam to stretch legs", mapUrl: "https://maps.google.com/?q=Tirana+Lake+Park+Albania" },
      { time: "16:30", type: "activity", label: "Blloku district — street cafés & city vibes", mapUrl: "https://maps.google.com/?q=Blloku+District+Tirana+Albania" },
      { time: "18:30", type: "activity", label: "Evening walk — Skanderbeg Square at dusk", sub: "Beautiful at night with the lights · grab a coffee on the square" , mapUrl: "https://maps.google.com/?q=Skanderbeg+Square+Tirana+Albania" },
      { time: "20:30", type: "food", label: "Dinner — Hayal Et", sub: "⭐ Best halal in Tirana · lake & park views · Turkish-Albanian fusion · kebabs, steaks with fire show, pide · reserve a table", mapUrl: "https://maps.google.com/?q=Hayal+Et+Tirana+Albania" },
    ]
  },
  {
    date: "May 9 · Sat", title: "Krujë → Airport → Home", badge: "Departure day", badgeColor: "#FAECE7", badgeText: "#712B13",
    prayerKey: "May 9", drive: "1h 30min",
    events: [
      { time: "07:30", type: "food", label: "Breakfast (included) & check out — Hotel Akropoli", sub: "Check-out by 10:00–11:00 · free parking · collect car before leaving" },
      { time: "08:15", type: "travel", label: "Drive to Krujë", sub: "~50 min · 31 km north · on the way toward airport", mapUrl: "https://maps.google.com/maps/dir/Tirana+Albania/Kruje+Albania" },
      { time: "09:05", type: "activity", label: "Krujë Castle & Ottoman bazaar", sub: "Outdoor walk only — no museums · bazaar is colourful, kids enjoy it", mapUrl: "https://maps.google.com/?q=Kruje+Castle+Albania" },
      { time: "10:30", type: "travel", label: "Leave Krujë → drive to airport", sub: "~40 min · 20 km back toward Rinas", mapUrl: "https://maps.google.com/maps/dir/Kruje+Albania/Tirana+International+Airport" },
      { time: "11:15", type: "food", label: "Lunch near Tirana or at airport" },
      { time: "13:00", type: "activity", label: "Airport area — relax, kids play, no rushing" },
      { time: "15:30", type: "flight", label: "Arrive airport TIA · check in", sub: "2h 35min before flight · plenty of buffer with kids" },
      { time: "18:05", type: "flight", label: "Depart Tirana (TIA) · W45111" },
      { time: "20:25", type: "flight", label: "Arrive Karlsruhe (FKB)" },
    ]
  },
];

const tripStops = [
  { label: "Tirana Airport (arrival)", lat: 41.4146, lng: 19.7206, day: "May 2", color: "#D85A30" },
  { label: "Aerostay Hotel, Rinas", lat: 41.3800, lng: 19.7150, day: "May 2", color: "#EF9F27" },
  { label: "Skanderbeg Square, Tirana", lat: 41.3275, lng: 19.8187, day: "May 3", color: "#7F77DD" },
  { label: "Bujtina Veritos, Berat", lat: 40.7058, lng: 19.9522, day: "May 3–4", color: "#EF9F27" },
  { label: "Berat Castle", lat: 40.7083, lng: 19.9481, day: "May 4", color: "#7F77DD" },
  { label: "Vlorë (rest stop)", lat: 40.4660, lng: 19.4897, day: "May 5", color: "#378ADD" },
  { label: "Apart-Hotel Lili2, Sarandë", lat: 39.8753, lng: 20.0053, day: "May 5–6", color: "#EF9F27" },
  { label: "Hand of Ksamil", lat: 39.7700, lng: 20.0100, day: "May 6", color: "#7F77DD" },
  { label: "Augustus Beach, Ksamil", lat: 39.7680, lng: 20.0080, day: "May 6", color: "#7F77DD" },
  { label: "Butrint National Park", lat: 39.7467, lng: 20.0178, day: "May 6", color: "#7F77DD" },
  { label: "Blue Eye Spring", lat: 39.9009, lng: 20.1786, day: "May 7", color: "#7F77DD" },
  { label: "Lëkurësi Castle, Sarandë", lat: 39.8642, lng: 20.0144, day: "May 7", color: "#7F77DD" },
  { label: "Tirana Lake Park", lat: 41.3317, lng: 19.8072, day: "May 8", color: "#7F77DD" },
  { label: "Blloku District, Tirana", lat: 41.3203, lng: 19.8199, day: "May 8", color: "#7F77DD" },
  { label: "Krujë Castle", lat: 41.5089, lng: 19.7956, day: "May 9", color: "#7F77DD" },
  { label: "Tirana Airport (departure)", lat: 41.4146, lng: 19.7206, day: "May 9", color: "#D85A30" },
];

function TripMap() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      // Fix default marker icon paths broken by bundlers
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView([40.4, 19.9], 7);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      // Draw route line
      const routeCoords = tripStops.map(s => [s.lat, s.lng]);
      L.polyline(routeCoords, { color: "#1a73e8", weight: 2.5, opacity: 0.6, dashArray: "6 4" }).addTo(map);

      // Add numbered markers
      tripStops.forEach((stop, i) => {
        const icon = L.divIcon({
          className: "",
          html: `<div style="
            background: ${stop.color};
            color: #fff;
            border: 2px solid #fff;
            border-radius: 50%;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            box-shadow: 0 1px 4px rgba(0,0,0,0.35);
            font-family: -apple-system, sans-serif;
          ">${i + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        L.marker([stop.lat, stop.lng], { icon })
          .addTo(map)
          .bindPopup(`<b>${stop.label}</b><br/><span style="color:#888;font-size:12px">${stop.day}</span>`);
      });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #E8E8ED", marginBottom: "1.25rem", position: "relative" }}>
      <div ref={mapRef} style={{ height: 340, width: "100%" }} />
      <a
        href="https://maps.google.com/maps/dir/Tirana+Airport+Albania/Tirana+Albania/Berat+Albania/Llogara+Pass+Albania/Sarande+Albania/Ksamil+Albania/Butrint+Albania/Blue+Eye+Albania/Kruje+Albania/Tirana+International+Airport+Albania"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          fontSize: 12,
          fontWeight: 500,
          color: "#fff",
          background: "#1a73e8",
          padding: "5px 12px",
          borderRadius: 6,
          textDecoration: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          zIndex: 1000,
        }}
      >
        ↗ Open in Google Maps
      </a>
    </div>
  );
}

const MapLink = ({ url }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    onClick={e => e.stopPropagation()}
    title="Open in Google Maps"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      fontSize: 11,
      color: "#378ADD",
      textDecoration: "none",
      padding: "2px 6px",
      borderRadius: 4,
      background: "#EAF4FF",
      border: "1px solid #C4DDF7",
      flexShrink: 0,
      whiteSpace: "nowrap",
    }}
  >
    ↗ Map
  </a>
);

function PrayerBar({ prayerKey }) {
  const t = prayerTimes[prayerKey];
  if (!t) return null;
  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: "6px 0",
      padding: "7px 1.25rem",
      background: "#F0FAF6",
      borderTop: "1px solid #C4E8D8",
      fontSize: 12,
    }}>
      <span style={{ color: "#0F6E56", fontWeight: 600, marginRight: 10 }}>🕌 Prayer times</span>
      {[["Fajr", t.fajr], ["Dhuhr", t.dhuhr], ["Asr", t.asr], ["Maghrib", t.maghrib], ["Isha", t.isha]].map(([name, time]) => (
        <span key={name} style={{ marginRight: 16, color: "#0F6E56" }}>
          <span style={{ opacity: 0.65 }}>{name} </span>
          <strong>{time}</strong>
        </span>
      ))}
    </div>
  );
}

function BookingCard({ b }) {
  const s = typeStyles[b.type] || typeStyles.hotel;
  return (
    <div style={{
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 10,
      padding: "12px 14px",
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: s.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {b.type === "flight" ? "✈ flight" : b.type === "todo" ? "⚠ to book" : b.type === "car" ? "🚗 car rental" : "🏨 hotel"}
        </div>
        {b.mapUrl && <MapLink url={b.mapUrl} />}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: s.text }}>{b.label}</div>
      <div style={{ fontSize: 12, color: s.text, opacity: 0.85 }}>{b.detail}</div>
      {b.breakfast && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content", background: "#FFF7E6", border: "1px solid #F5CC7A", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: "#7A4A10" }}>
          🍳 Breakfast included
        </div>
      )}
      {b.conf !== "—" && (
        <div style={{ fontSize: 11, color: s.text, opacity: 0.65, marginTop: 2 }}>
          Conf: <strong>{b.conf}</strong>
        </div>
      )}
      <div style={{ fontSize: 11, color: s.text, opacity: 0.7 }}>{b.extra}</div>
      {b.voucherUrl && (
        <a
          href={b.voucherUrl}
          download
          style={{
            marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 600, color: s.text,
            background: "rgba(0,0,0,0.07)", borderRadius: 6, padding: "4px 10px",
            textDecoration: "none", width: "fit-content",
          }}
        >
          ⬇ Download Voucher PDF
        </a>
      )}
    </div>
  );
}

function EventRow({ ev, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(ev.label);
  const [timeVal, setTimeVal] = useState(ev.time);
  const [subVal, setSubVal] = useState(ev.sub || "");
  const save = () => { onEdit({ ...ev, label: val, time: timeVal, sub: subVal }); setEditing(false); };

  if (editing) return (
    <div style={{ padding: "8px 1.25rem", background: "#F7F7FA", borderTop: "1px solid var(--color-border-tertiary)", borderBottom: "1px solid var(--color-border-tertiary)", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={timeVal} onChange={e => setTimeVal(e.target.value)} style={{ width: 58, fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc" }} />
        <input value={val} onChange={e => setVal(e.target.value)} style={{ flex: 1, fontSize: 13, padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc" }} />
      </div>
      <input value={subVal} onChange={e => setSubVal(e.target.value)} placeholder="Sub-label (optional)" style={{ fontSize: 12, padding: "4px 6px", borderRadius: 4, border: "1px solid #ccc" }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={save} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 4, background: "#1a1a1a", color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
        <button onClick={() => setEditing(false)} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 4, background: "#eee", border: "none", cursor: "pointer" }}>Cancel</button>
        <button onClick={onDelete} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 4, background: "#fee", color: "#c00", border: "1px solid #f5c2c2", cursor: "pointer", marginLeft: "auto" }}>Delete</button>
      </div>
    </div>
  );

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "0.45rem 1.25rem",
        cursor: "default",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#F7F7FA"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      <span style={{ fontSize: 12, color: "#999", minWidth: 44, paddingTop: 3, fontVariantNumeric: "tabular-nums" }}>{ev.time}</span>
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: dotColors[ev.type] || "#888",
        marginTop: 5, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          color: "var(--color-text-primary)",
          fontWeight: 400,
          lineHeight: 1.4,
        }}>{ev.label}</div>
        {ev.sub && <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>{ev.sub}</div>}
        {(ev.type === "activity" || ev.type === "food") && <PhotoCarousel label={ev.label} />}
      </div>
      {ev.mapUrl && <MapLink url={ev.mapUrl} />}
    </div>
  );
}

export default function App() {
  const [days, setDays] = useState(initialDays);
  const updateEvent = (di, ei, newEv) => setDays(days.map((day, i) => i !== di ? day : { ...day, events: day.events.map((ev, j) => j !== ei ? ev : newEv) }));
  const deleteEvent = (di, ei) => setDays(days.map((day, i) => i !== di ? day : { ...day, events: day.events.filter((_, j) => j !== ei) }));
  const addEvent = (di) => setDays(days.map((day, i) => i !== di ? day : { ...day, events: [...day.events, { time: "00:00", type: "activity", label: "New event", sub: "" }] }));

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 820, margin: "0 auto", padding: "1.5rem 1rem" }}>

      {/* HEADER */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", letterSpacing: "-0.3px" }}>🇦🇱 Albania</div>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#555" }}>May 2–9, 2026</div>
        </div>
        <div style={{ fontSize: 13, color: "#888", marginBottom: "1.25rem" }}>
          Sufiyan · Anam · Yusuf Sufiyan · Maryam &nbsp;·&nbsp; Rental car throughout
        </div>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 16,
          background: "#EBF3FF",
          border: "1px solid #BDD6F5",
          borderRadius: 8,
          padding: "8px 16px",
          fontSize: 12,
          color: "#1A5FA8",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
        }}>
          <span style={{ fontWeight: 700 }}>🚗 Total driving: ~15h 50min across 7 days</span>
          <span>May 3: 1h 55min</span>
          <span>May 4: 3h (Osumi Canyon return)</span>
          <span>May 5: 3h 30min</span>
          <span>May 6: 30min</span>
          <span>May 7: 1h 15min</span>
          <span>May 8: 4h 10min</span>
          <span>May 9: 1h 30min</span>
        </div>

        {/* MAP */}
        <TripMap />

        {/* BOOKING CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: "1.25rem" }}>
          {bookings.map((b, i) => <BookingCard key={i} b={b} />)}
        </div>

        {/* TRIP COST ESTIMATE */}
        <div style={{
          background: "#FAFAFA",
          border: "1px solid #E2E2E8",
          borderRadius: 8,
          padding: "12px 16px",
          fontSize: 12,
          color: "#333",
          marginBottom: "0.75rem",
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a", marginBottom: 10 }}>💰 Trip Budget Estimate · 4 people · 8 days</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 16px" }}>
            {[
              { label: "✈️  Flights (Wizz Air × 4)", confirmed: "€322.74", estimate: null, note: "FKB–TIA / TIA–FKB · conf. VMG83J · inv. DWAM-45305759" },
              { label: "🏨  Aerostay Hotel · 1 night", confirmed: "€45.00", estimate: null, note: "conf. 6691.888.757" },
              { label: "🏨  Bujtina Veritos · 2 nights", confirmed: "€92.22", estimate: null, note: "conf. 6075.108.573 · cash only" },
              { label: "🏨  Apart-Hotel Lili2 · 2 nights", confirmed: "€80.20", estimate: null, note: "conf. 5312.498.819" },
              { label: "🏨  Hotel Sarandë · 1 night", confirmed: null, estimate: "~€50–80", note: "still to book" },
              { label: "🏨  Hotel Tirana · 1 night", confirmed: null, estimate: "~€60–90", note: "still to book" },
              { label: "🚗  Car rental · 7 days · Fiat Panda", confirmed: "€106.00", estimate: null, note: "€56.99 paid + €49 on arrival · CJT-202532255" },
              { label: "⛽  Fuel · ~900 km total", confirmed: null, estimate: "~€100–120", note: "diesel ~€1.35/L in Albania" },
              { label: "🍽️  Dinners · 6 nights × 2 adults", confirmed: null, estimate: "~€160–200", note: "~€15/person at halal restaurants" },
              { label: "🥗  Lunches & snacks · 8 days", confirmed: null, estimate: "~€140–180", note: "€10–15/person · local tavernas" },
              { label: "🎟️  Activities & entry fees", confirmed: null, estimate: "~€40–60", note: "boat trip, clock tower, Blue Eye" },
              { label: "🧃  Coffees, ice cream & misc", confirmed: null, estimate: "~€60–80", note: "€8–10/day" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontWeight: 600, color: "#222" }}>{row.label}</span>
                {row.confirmed
                  ? <span style={{ color: "#0A7A4A", fontWeight: 700 }}>{row.confirmed} <span style={{ color: "#888", fontWeight: 400 }}>confirmed</span></span>
                  : <span style={{ color: "#555" }}>{row.estimate}</span>
                }
                <span style={{ color: "#aaa", fontSize: 11 }}>{row.note}</span>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: "1px solid #E2E2E8",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 24px",
            alignItems: "baseline",
          }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>Confirmed so far: <span style={{ color: "#0A7A4A" }}>€743.77</span></span>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#1a1a1a" }}>Total estimate: <span style={{ color: "#7A4A10" }}>~€1,100–1,300</span></span>
            <span style={{ fontSize: 11, color: "#aaa" }}>excl. flights · 2 hotels TBD · pocket money not included</span>
          </div>
        </div>

        {/* PRAYER TIMES BANNER */}
        <div style={{
          background: "#F0FAF6",
          border: "1px solid #C4E8D8",
          borderRadius: 8,
          padding: "10px 16px",
          fontSize: 12,
          color: "#0F6E56",
          display: "flex",
          flexWrap: "wrap",
          gap: "10px 20px",
          alignItems: "center",
        }}>
          <span style={{ fontWeight: 600 }}>🕌 Hanafi prayer times · Tirana, May 2–9</span>
          <span>Fajr 03:39–03:54</span>
          <span>Dhuhr 12:41</span>
          <span>Asr 16:31–16:33</span>
          <span>Maghrib 19:40–19:47</span>
          <span>Isha 21:20–21:31</span>
          <span style={{ opacity: 0.65, fontSize: 11 }}>Source: al-habib.info · MWL / Hanafi Asr</span>
        </div>
      </div>

      {/* LEGEND */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", paddingBottom: "1.25rem", borderBottom: "1px solid #eee", marginBottom: "1.25rem" }}>
        {[["flight","#D85A30"],["travel","#378ADD"],["food","#1D9E75"],["activity","#7F77DD"],["hotel","#EF9F27"]].map(([k,c]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#888" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />{k}
          </div>
        ))}
        <span style={{ fontSize: 12, color: "#bbb", marginLeft: "auto" }}>Double-click event to edit</span>
      </div>

      {/* DAYS */}
      {days.map((day, di) => (
        <div key={di} style={{
          background: "#fff",
          border: "1px solid #E8E8ED",
          borderRadius: 12,
          marginBottom: "1rem",
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <div style={{
            padding: "0.75rem 1.25rem",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "#FAFAFA",
            borderBottom: "1px solid #EBEBEB",
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#999", minWidth: 90 }}>{day.date}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{day.title}</span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
              {day.drive && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "3px 9px",
                  borderRadius: 20,
                  background: "#EBF3FF",
                  color: "#1A5FA8",
                  whiteSpace: "nowrap",
                }}>🚗 {day.drive}</span>
              )}
              <span style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 10px",
                borderRadius: 20,
                background: day.badgeColor,
                color: day.badgeText,
                whiteSpace: "nowrap",
              }}>{day.badge}</span>
            </div>
          </div>
          <div style={{ padding: "0.4rem 0 0.6rem" }}>
            {day.events.map((ev, ei) => (
              <EventRow key={ei} ev={ev} onEdit={newEv => updateEvent(di, ei, newEv)} onDelete={() => deleteEvent(di, ei)} />
            ))}
            <div style={{ padding: "0.2rem 1.25rem", marginTop: 2 }}>
              <button
                onClick={() => addEvent(di)}
                style={{ fontSize: 12, color: "#aaa", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >+ Add event</button>
            </div>
          </div>
          <PrayerBar prayerKey={day.prayerKey} />
        </div>
      ))}
    </div>
  );
}
