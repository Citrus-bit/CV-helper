#let data = json("resume.json")
#let profile = data.at("profile", default: (:))
#let sections = data.at("sections", default: ())
#let value(dictionary, key) = dictionary.at(key, default: "")
#let present(item) = type(item) == str and item.trim() != ""
#let accent = rgb("#14635B")
#let ink = rgb("#18201F")
#let muted = rgb("#5E6A68")
#let rule = rgb("#CCD8D5")
#let contacts = (
  value(profile, "email"),
  value(profile, "phone"),
  value(profile, "location"),
).filter(present)

#set document(title: value(profile, "name"), author: value(profile, "name"))
#set page(
  paper: "a4",
  margin: (x: 17mm, top: 12mm, bottom: 13mm),
  footer: context {
    let total = counter(page).final().at(0)
    if total > 1 {
      align(right, text(size: 7.5pt, fill: muted)[
        #counter(page).display("1") / #total
      ])
    }
  },
)
#set text(
  font: ("Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", "Arial"),
  fallback: true,
  lang: "zh",
  size: 9.2pt,
  fill: ink,
)
#set par(justify: false, leading: 0.5em)

#align(center)[
  #text(size: 21pt, weight: "bold", fill: ink)[#value(profile, "name")]
  #if present(value(profile, "headline")) [
    #v(3pt)
    #text(size: 10.5pt, weight: "medium", fill: accent)[#value(profile, "headline")]
  ]
  #if contacts.len() > 0 [
    #v(3.5pt)
    #text(size: 8.3pt, fill: muted)[#contacts.join("  |  ")]
  ]
]
#v(6pt)
#line(length: 100%, stroke: 0.9pt + accent)

#if present(value(profile, "summary")) [
  #v(6pt)
  #text(size: 8.9pt, fill: ink)[#value(profile, "summary")]
]

#for section in sections [
  #v(8pt)
  #block(sticky: true)[
    #grid(
      columns: (auto, 1fr),
      gutter: 9pt,
      align: horizon,
      text(size: 11pt, weight: "bold", fill: accent)[#value(section, "title")],
      line(length: 100%, stroke: 0.7pt + rule),
    )
  ]
  #for item in section.at("items", default: ()) [
    #v(4.5pt)
    #block(sticky: true)[
      #grid(
        columns: (1fr, auto),
        gutter: 10pt,
        [
          #text(size: 9.7pt, weight: "semibold")[#value(item, "title")]
          #if present(value(item, "subtitle")) [
            #h(5pt)
            #text(size: 8.8pt, fill: muted)[#value(item, "subtitle")]
          ]
        ],
        text(size: 8.2pt, fill: muted)[#value(item, "date")],
      )
    ]
    #for bullet in item.at("bullets", default: ()) [
      #if present(bullet) [
        #v(2pt)
        #grid(
          columns: (7pt, 1fr),
          gutter: 2pt,
          align: top,
          text(fill: accent)[•],
          [#bullet],
        )
      ]
    ]
  ]
]
