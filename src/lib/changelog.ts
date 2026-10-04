import type { Locale } from "@/lib/i18n"

export type ChangelogKind = "added" | "fixed" | "improved"

export type ChangelogEntry = {
  id: string
  date: string
  kind: ChangelogKind
  en: string
  tc: string
  sc: string
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    id: "2026-10-04-ferry-plates",
    date: "2026-10-04",
    kind: "fixed",
    en: "A ferry waiting at the pier stays on the pier card. A boat with a published position shows where it is heading.",
    tc: "尚未開出的渡輪留在碼頭卡片。已公布船位的渡輪會顯示前往的地點。",
    sc: "尚未开出的渡轮留在码头卡片。已公布船位的渡轮会显示前往的地点。",
  },
  {
    id: "2026-10-04-one-train",
    date: "2026-10-04",
    kind: "fixed",
    en: "Two trains heading the same way no longer sit on one spot.",
    tc: "同一方向的兩班列車不再疊在同一個位置。",
    sc: "同一方向的两班列车不再叠在同一个位置。",
  },
  {
    id: "2026-10-04-heading-plate",
    date: "2026-10-04",
    kind: "added",
    en: "At street zoom, an MTR train and a ferry show where they are heading, on the same kind of plate as a Light Rail train. MTR does not publish a train number.",
    tc: "在街道比例下，港鐵列車和渡輪以與輕鐵相同的牌子顯示前往的地點。港鐵沒有公布車號。",
    sc: "在街道比例下，港铁列车和渡轮以与轻铁相同的牌子显示前往的地点。港铁没有公布车号。",
  },
  {
    id: "2026-10-04-ranked-marquee",
    date: "2026-10-04",
    kind: "fixed",
    en: "The collapsed ticker always runs the ranked items, whichever list was open.",
    tc: "情報欄收起時，無論先前查看哪個分頁，跑馬燈都顯示優先項目。",
    sc: "情报栏收起时，无论先前查看哪个分页，跑马灯都显示优先项目。",
  },
  {
    id: "2026-10-04-one-stop-read",
    date: "2026-10-04",
    kind: "improved",
    en: "Opening a stop shows every arrival time that operator published for that stop.",
    tc: "打開一站，卡片顯示該營運商為該站公布的每一個到站時間。",
    sc: "打开一站，卡片显示该营运商为该站公布的每一个到站时间。",
  },
  {
    id: "2026-10-04-board-fault",
    date: "2026-10-04",
    kind: "fixed",
    en: "When a stop's arrival read fails, the card says so, and that stop is listed under Systems.",
    tc: "車站到站時間讀取失敗時，卡片會寫明，並在系統分頁列出該站。",
    sc: "车站到站时间读取失败时，卡片会写明，并在系统分页列出该站。",
  },
  {
    id: "2026-10-04-stop-board",
    date: "2026-10-04",
    kind: "fixed",
    en: "Opening a stop reads that stop's published times, in any part of the city.",
    tc: "打開任何一站，都會讀取該站已公布的到站時間。",
    sc: "打开任何一站，都会读取该站已公布的到站时间。",
  },
  {
    id: "2026-10-04-shared-stop",
    date: "2026-10-04",
    kind: "fixed",
    en: "Stops that share a point show every bus that uses that point.",
    tc: "同一位置的車站，會在同一張卡片列出所有途經的班次。",
    sc: "同一位置的车站，会在同一张卡片列出所有途经的班次。",
  },
  {
    id: "2026-10-04-stop-clocks",
    date: "2026-10-04",
    kind: "fixed",
    en: "Bus and minibus stops show the arrival times the operators have published.",
    tc: "巴士和小巴站顯示營運商已公布的到站時間。",
    sc: "巴士和小巴站显示营运商已公布的到站时间。",
  },
  {
    id: "2026-10-03-bus-direction",
    date: "2026-10-03",
    kind: "fixed",
    en: "When a bus operator publishes where a bus is going, that destination is written on the stop sign. Nearby signs no longer cover one another.",
    tc: "巴士營運商有公布目的地時，站牌會寫上該班車前往的地點。相近的站牌不再疊在一起。",
    sc: "巴士营运商有公布目的地时，站牌会写上该班车前往的地点。相近的站牌不再叠在一起。",
  },
  {
    id: "2026-10-03-harbour-from",
    date: "2026-10-03",
    kind: "improved",
    en: "The three harbour times are compared from the same roadside sign, the one nearest the map. You can choose another sign.",
    tc: "三條過海時間以同一個路口比較，預設是地圖上最近的路口，也可以另選起點。",
    sc: "三条过海时间以同一个路口比较，预设是地图上最近的路口，也可以另选起点。",
  },
  {
    id: "2026-10-03-gmb-dest",
    date: "2026-10-03",
    kind: "added",
    en: "A green minibus card shows where that minibus is going.",
    tc: "綠色專線小巴卡片顯示小巴前往的地點。",
    sc: "绿色专线小巴卡片显示小巴前往的地点。",
  },
  {
    id: "2026-10-03-satellite",
    date: "2026-10-03",
    kind: "improved",
    en: "The satellite picture on a phone is sharper.",
    tc: "手機上的衛星圖更清晰。",
    sc: "手机上的卫星图更清晰。",
  },
  {
    id: "2026-10-03-top-bar",
    date: "2026-10-03",
    kind: "improved",
    en: "On a phone, the top bar is one line. The tunnel times, weather, and speed stay on that line, clear of the map buttons.",
    tc: "在手機上，頂欄是一行。隧道時間、天氣和車速都在這一行，不會被地圖按鈕擋住。",
    sc: "在手机上，顶栏是一行。隧道时间、天气和车速都在这一行，不会被地图按钮挡住。",
  },
  {
    id: "2026-10-03-ferry-channel",
    date: "2026-10-03",
    kind: "fixed",
    en: "A ferry without a published position follows the harbour and the sea channel, instead of a straight line across Hong Kong Island.",
    tc: "沒有公布船位的渡輪，沿海港和航道顯示，不再以直線橫過香港島。",
    sc: "没有公布船位的渡轮，沿海港和航道显示，不再以直线横过香港岛。",
  },
  {
    id: "2026-10-03-ferry-move",
    date: "2026-10-03",
    kind: "added",
    en: "Ferries that do not publish a boat position are drawn on the crossing and move with the sailing time.",
    tc: "沒有公布船位的渡輪，會按開出和到達時間在航道上移動。",
    sc: "没有公布船位的渡轮，会按开出和到达时间在航道上移动。",
  },
  {
    id: "2026-10-03-ferry-gps",
    date: "2026-10-03",
    kind: "fixed",
    en: "When Sun Ferry publishes a boat position, the map uses that position.",
    tc: "新渡輪公布船位時，地圖使用該船位。",
    sc: "新渡轮公布船位时，地图使用该船位。",
  },
  {
    id: "2026-10-03-tsuen-wan",
    date: "2026-10-03",
    kind: "fixed",
    en: "Tsuen Wan line trains are shown with the other MTR lines.",
    tc: "荃灣綫列車與其他港鐵綫一同顯示。",
    sc: "荃湾线列车与其他港铁线一同显示。",
  },
  {
    id: "2026-10-03-arrivals",
    date: "2026-10-03",
    kind: "improved",
    en: "Bus and ferry arrival times keep updating while several feeds are open.",
    tc: "同時開啟多項到站資料時，巴士和渡輪的到站時間仍會更新。",
    sc: "同时开启多项到站资料时，巴士和渡轮的到站时间仍会更新。",
  },
  {
    id: "2026-10-02-places",
    date: "2026-10-02",
    kind: "added",
    en: "Green minibuses, New Lantao buses, and ferry piers are on the map.",
    tc: "地圖加入綠色專線小巴、嶼巴和渡輪碼頭。",
    sc: "地图加入绿色专线小巴、屿巴和渡轮码头。",
  },
  {
    id: "2026-10-02-sun",
    date: "2026-10-02",
    kind: "added",
    en: "Every Sun Ferry route in the public arrival feed is included, with the inter-island boats.",
    tc: "公開到站資料中的新渡輪航線都已加入，包括橫水渡。",
    sc: "公开到站资料中的新渡轮航线都已加入，包括横水渡。",
  },
  {
    id: "2026-10-02-fortune",
    date: "2026-10-02",
    kind: "added",
    en: "The Fortune Ferry timetable for North Point and Kwun Tong is shown, and marked as a timetable.",
    tc: "北角和觀塘的富裕小輪船期已顯示，並註明是船期。",
    sc: "北角和观塘的富裕小轮船期已显示，并注明是船期。",
  },
  {
    id: "2026-10-02-systems",
    date: "2026-10-02",
    kind: "added",
    en: "This card has a systems list for a feed that does not load.",
    tc: "情報卡加入系統分頁，列出未能讀取的資料。",
    sc: "情报卡加入系统分页，列出未能读取的资料。",
  },
  {
    id: "2026-10-02-ferry-place",
    date: "2026-10-02",
    kind: "fixed",
    en: "A ferry card names where the boat is going, or where it is coming from.",
    tc: "渡輪卡片顯示船隻前往或駛來的地點。",
    sc: "渡轮卡片显示船只前往或驶来的地点。",
  },
  {
    id: "2026-10-02-berths",
    date: "2026-10-02",
    kind: "fixed",
    en: "Ferry pier pins sit on the passenger berths.",
    tc: "渡輪碼頭標記放在乘客碼頭的位置。",
    sc: "渡轮码头标记放在乘客码头的位置。",
  },
  {
    id: "2026-10-02-nlb",
    date: "2026-10-02",
    kind: "fixed",
    en: "New Lantao Bus arrival times use the Hong Kong clock.",
    tc: "嶼巴到站時間按香港時間顯示。",
    sc: "屿巴到站时间按香港时间显示。",
  },
  {
    id: "2026-10-02-gmb-zoom",
    date: "2026-10-02",
    kind: "improved",
    en: "Green minibus stops appear when the map is close enough to read them.",
    tc: "地圖放大至足以閱讀時，才顯示綠色專線小巴車站。",
    sc: "地图放大至足以阅读时，才显示绿色专线小巴车站。",
  },
  {
    id: "2026-10-02-routes",
    date: "2026-10-02",
    kind: "improved",
    en: "A stop still lists its routes when no arrival time is published.",
    tc: "車站未有到站時間時，仍會列出路線編號。",
    sc: "车站未有到站时间时，仍会列出路线编号。",
  },
  {
    id: "2026-10-02-crossing",
    date: "2026-10-02",
    kind: "fixed",
    en: "A harbour crossing with no published time is left off the bar.",
    tc: "沒有公布時間的過海航程不會出現在頂欄。",
    sc: "没有公布时间的过海航程不会出现在顶栏。",
  },
]

export function changelogText(entry: ChangelogEntry, locale: Locale): string {
  switch (locale) {
    case "en":
      return entry.en
    case "zh-CN":
      return entry.sc
    case "zh-HK":
      return entry.tc
    default: {
      const exhaustive: never = locale
      return exhaustive
    }
  }
}
