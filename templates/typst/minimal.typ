#let data = json("resume.json")
#let profile = data.at("profile", default: (:))
#let sections = data.at("sections", default: ())
#let value(dictionary, key) = dictionary.at(key, default: "")
#let present(item) = type(item) == str and item.trim() != ""
#let ink = rgb("#151719")
#let muted = rgb("#686D72")
#let accent = rgb("#2E5D78")
#let contacts = (
  value(profile, "email"),
  value(profile, "phone"),
  value(profile, "location"),
).filter(present)

#set document(title: value(profile, "name"), author: value(profile, "name"))
#set page(
  paper: "a4",
  margin: (x: 21mm, top: 16mm, bottom: 16mm),
  footer: context {
    let total = counter(page).final().at(0)
    if total > 1 {
      align(center, text(size: 7pt, fill: muted)[
        #counter(page).display("1") / #total
      ])
    }
  },
)
#set text(
  font: ("Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", "Arial"),
  fallback: true,
  lang: "zh",
  size: 9.5pt,
  fill: ink,
)
#set par(justify: false, leading: 0.68em)

#text(size: 24pt, weight: "light", fill: ink)[#value(profile, "name")]
#if present(value(profile, "headline")) [
  #v(3pt)
  #text(size: 10.5pt, fill: accent)[#value(profile, "headline")]
]
#if contacts.len() > 0 [
  #v(5pt)
  #text(size: 8.3pt, fill: muted)[#contacts.join("  |  ")]
]
#v(9pt)
#line(length: 100%, stroke: 0.6pt + rgb("#B9BEC2"))

#if present(value(profile, "summary")) [
  #v(9pt)
  #text(size: 9.2pt, fill: rgb("#303437"))[#value(profile, "summary")]
]

#for section in sections [
  #v(10pt)
  #block(sticky: true)[
    #text(size: 10.5pt, weight: "bold", fill: accent)[#upper(value(section, "title"))]
    #v(2pt)
    #line(length: 28mm, stroke: 1.1pt + accent)
  ]
  #for item in section.at("items", default: ()) [
    #v(6pt)
    #block(sticky: true)[
      #grid(
        columns: (1fr, auto),
        gutter: 12pt,
        [
          #text(size: 9.8pt, weight: "semibold")[#value(item, "title")]
          #if present(value(item, "subtitle")) [
            #v(1.5pt)
            #text(size: 8.7pt, fill: muted)[#value(item, "subtitle")]
          ]
        ],
        text(size: 8.2pt, fill: muted)[#value(item, "date")],
      )
    ]
    #for bullet in item.at("bullets", default: ()) [
      #if present(bullet) [
        #v(2.5pt)
        #grid(
          columns: (8pt, 1fr),
          gutter: 3pt,
          align: top,
          text(size: 7pt, fill: accent)[•],
          [#bullet],
        )
      ]
    ]
  ]
]
