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
  margin: (x: 14mm, top: 10mm, bottom: 10mm),
  footer: context align(right, text(size: 7pt, fill: muted)[#counter(page).display("1")]),
)
#set text(
  font: ("Noto Sans CJK SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", "Arial"),
  fallback: true,
  lang: "zh",
  size: 8.4pt,
  fill: ink,
)
#set par(justify: false, leading: 0.4em)

#grid(
  columns: (1fr, auto),
  gutter: 12pt,
  align: bottom,
  [
    #text(size: 20pt, weight: "bold")[#value(profile, "name")]
    #if present(value(profile, "headline")) [
      #h(7pt)
      #text(size: 9.3pt, weight: "medium", fill: accent)[#value(profile, "headline")]
    ]
  ],
  align(right)[
    #text(size: 7.6pt, fill: muted)[#contacts.join("  |  ")]
  ],
)
#v(5pt)
#line(length: 100%, stroke: 1pt + accent)

#if present(value(profile, "summary")) [
  #v(5pt)
  #text(size: 8.2pt)[#value(profile, "summary")]
]

#for section in sections [
  #v(6pt)
  #block(sticky: true)[
    #grid(
      columns: (24mm, 1fr),
      gutter: 5pt,
      align: horizon,
      text(size: 9.4pt, weight: "bold", fill: accent)[#value(section, "title")],
      line(length: 100%, stroke: 0.5pt + rgb("#C7CCCF")),
    )
  ]
  #for item in section.at("items", default: ()) [
    #v(3pt)
    #block(sticky: true)[
      #grid(
        columns: (1fr, auto),
        gutter: 8pt,
        [
          #text(size: 8.8pt, weight: "semibold")[#value(item, "title")]
          #if present(value(item, "subtitle")) [
            #h(4pt)
            #text(size: 7.8pt, fill: muted)[#value(item, "subtitle")]
          ]
        ],
        text(size: 7.5pt, fill: muted)[#value(item, "date")],
      )
    ]
    #for bullet in item.at("bullets", default: ()) [
      #if present(bullet) [
        #v(1.3pt)
        #grid(
          columns: (6pt, 1fr),
          gutter: 2pt,
          align: top,
          text(size: 7pt, fill: accent)[•],
          [#bullet],
        )
      ]
    ]
  ]
]
