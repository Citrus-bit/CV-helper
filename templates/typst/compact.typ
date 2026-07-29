#let data = json("resume.json")
#let profile = data.at("profile", default: (:))
#let sections = data.at("sections", default: ())
#let value(dictionary, key) = dictionary.at(key, default: "")
#let present(item) = type(item) == str and item.trim() != ""
#let ink = rgb("#172027")
#let muted = rgb("#5C656B")
#let accent = rgb("#8B3B34")
#let contacts = (
  value(profile, "email"),
  value(profile, "phone"),
  value(profile, "location"),
).filter(present)

#set document(title: value(profile, "name"), author: value(profile, "name"))
#set page(
  paper: "a4",
  margin: (x: 11mm, top: 8mm, bottom: 8mm),
  footer: context {
    let total = counter(page).final().at(0)
    if total > 1 {
      align(right, text(size: 7pt, fill: muted)[
        #counter(page).display("1") / #total
      ])
    }
  },
)
#set text(
  font: ("Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", "Arial"),
  fallback: true,
  lang: "zh",
  size: 7.8pt,
  fill: ink,
)
#set par(justify: false, leading: 0.25em)

#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  align: bottom,
  [
    #text(size: 17pt, weight: "bold")[#value(profile, "name")]
    #if present(value(profile, "headline")) [
      #h(7pt)
      #text(size: 8.6pt, weight: "medium", fill: accent)[#value(profile, "headline")]
    ]
  ],
  align(right)[
    #text(size: 7.2pt, fill: muted)[#contacts.join("  |  ")]
  ],
)
#v(3pt)
#line(length: 100%, stroke: 0.8pt + accent)

#if present(value(profile, "summary")) [
  #v(3pt)
  #text(size: 7.6pt)[#value(profile, "summary")]
]

#for section in sections [
  #v(4pt)
  #block(sticky: true)[
    #grid(
      columns: (20mm, 1fr),
      gutter: 4pt,
      align: horizon,
      text(size: 8.6pt, weight: "bold", fill: accent)[#value(section, "title")],
      line(length: 100%, stroke: 0.5pt + rgb("#C7CCCF")),
    )
  ]
  #for item in section.at("items", default: ()) [
    #v(1.5pt)
    #block(sticky: true)[
      #grid(
        columns: (1fr, auto),
        gutter: 5pt,
        [
          #text(size: 8pt, weight: "semibold")[#value(item, "title")]
          #if present(value(item, "subtitle")) [
            #h(3pt)
            #text(size: 7.2pt, fill: muted)[#value(item, "subtitle")]
          ]
        ],
        text(size: 7.1pt, fill: muted)[#value(item, "date")],
      )
    ]
    #for bullet in item.at("bullets", default: ()) [
      #if present(bullet) [
        #v(0.4pt)
        #grid(
          columns: (5pt, 1fr),
          gutter: 1pt,
          align: top,
          text(size: 7pt, fill: accent)[•],
          [#bullet],
        )
      ]
    ]
  ]
]
