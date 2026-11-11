# v1.4 · Timeline

[Now](now.md) · [Board](board.md) · [Pipeline](pipeline.md) · **Timeline** · [Effort](effort.md)  
<sub>Frozen at Nov 1, 2026 12:27</sub>

### Nov 1 · 22 runs · 3 h 29 min of agent time · $15.50

```mermaid
---
config:
  themeVariables:
    taskBkgColor: '#4a5d8a'
    taskBorderColor: '#34446a'
    critBkgColor: '#a4262c'
    critBorderColor: '#6e1a1e'
    activeTaskBkgColor: '#8f5f00'
    activeTaskBorderColor: '#5e3e00'
---
gantt
  dateFormat x
  axisFormat %H:%M
  todayMarker off
  section C3
    builder r1 sonnet :1793542555975, 1793543695975
    reviewer r1 opus :crit, 1793543702757, 1793544200757
    fixer r1 sonnet :1793544784762, 1793546180762
    reviewer r2 opus :crit, 1793546185080, 1793546877080
    fixer r2 sonnet :1793546882849, 1793547062849
    reviewer r3 opus :1793547147368, 1793547406368
  section block-AB
    auditor r1 opus :crit, 1793542999308, 1793543321308
    fixer r1 sonnet :1793547425764, 1793547640764
    fixer r2 sonnet :1793548696282, 1793549542282
  section block-C
    auditor r1 opus :1793547424388, 1793547806388
    fixer r1 sonnet :1793547821123, 1793547993123
  section D1
    planner r1 sonnet :1793552481508, 1793552919508
    builder r1 sonnet :1793552934522, 1793554272522
    reviewer r1 sonnet :1793554278123, 1793554452123
  section D2
    planner r1 sonnet :1793554463343, 1793554676343
    builder r1 sonnet :1793554683097, 1793557084097
    reviewer r1 sonnet :1793555855451, 1793556025451
  section D3
    planner r1 sonnet :1793556035897, 1793556299897
    builder r1 sonnet :1793556306558, 1793557288558
    reviewer r1 sonnet :1793557297747, 1793557409747
  section block-D
    auditor r1 opus :1793564460834, 1793564716834
    fixer r1 sonnet :1793564727736, 1793564829736
```

### Oct 31 · 30 runs · 8 h 10 min of agent time · $27.61

```mermaid
---
config:
  themeVariables:
    taskBkgColor: '#4a5d8a'
    taskBorderColor: '#34446a'
    critBkgColor: '#a4262c'
    critBorderColor: '#6e1a1e'
    activeTaskBkgColor: '#8f5f00'
    activeTaskBorderColor: '#5e3e00'
---
gantt
  dateFormat x
  axisFormat %H:%M
  todayMarker off
  section B1
    planner r1 opus :1793469946215, 1793470602215
    builder r1 sonnet :1793470668715, 1793471551715
    reviewer r1 opus :crit, 1793471569099, 1793472739099
    fixer r1 sonnet :1793472752384, 1793473129384
    reviewer r2 opus :1793474019573, 1793474301573
  section B3
    planner r1 opus :1793470615563, 1793471058563
    builder r1 sonnet :1793474318116, 1793475167116
    reviewer r1 opus :1793475179302, 1793475702302
  section B4
    planner r1 opus :1793471558066, 1793472026066
    builder r1 sonnet :1793488717333, 1793490252333
    reviewer r1 sonnet :1793490017749, 1793490528749
  section B2
    planner r1 opus :1793474317773, 1793474820773
    builder r1 sonnet :1793475713079, 1793488090079
    reviewer r1 sonnet :1793488164041, 1793488652041
  section C1
    planner r1 sonnet :1793488726927, 1793488934927
    builder r1 sonnet :1793488948570, 1793489206570
    reviewer r1 sonnet :crit, 1793489212270, 1793489434270
  section C2
    planner r1 sonnet :1793489475059, 1793489832059
    builder r1 sonnet :1793489838784, 1793490310784
    reviewer r1 sonnet :1793490317083, 1793490474083
    clerk r1 haiku :1793490482169, 1793490582169
  section C4
    planner r1 sonnet :1793490498032, 1793490735032
  section block-B
    fixer r1 sonnet :1793490576786, 1793492342786
  section C4a
    builder r1 sonnet :1793490749180, 1793491672180
    reviewer r1 sonnet :1793491683316, 1793492343316
  section C4b
    builder r1 sonnet :1793492942683, 1793493339683
    reviewer r1 sonnet :1793493349766, 1793493759766
  section C4c
    builder r1 sonnet :1793493773258, 1793494351258
    reviewer r1 sonnet :1793494356720, 1793495093720
  section C3
    planner r1 sonnet :1793494374050, 1793495243050
```

### Oct 29 · 10 runs · 1 h 47 min of agent time · $2.13

```mermaid
---
config:
  themeVariables:
    taskBkgColor: '#4a5d8a'
    taskBorderColor: '#34446a'
    critBkgColor: '#a4262c'
    critBorderColor: '#6e1a1e'
    activeTaskBkgColor: '#8f5f00'
    activeTaskBorderColor: '#5e3e00'
---
gantt
  dateFormat x
  axisFormat %H:%M
  todayMarker off
  section A1-A3
    planner r1 sonnet :1793292023050, 1793292083050
    clerk r1 haiku :1793292073713, 1793293516713
    reviewer r1 sonnet :crit, 1793293102765, 1793293861765
    fixer r1 haiku :1793293873602, 1793294117602
  section A2
    planner r1 sonnet :1793292023405, 1793292083405
    builder r1 sonnet :1793292083064, 1793293840064
    reviewer r1 sonnet :1793293851017, 1793294161017
  section A4
    planner r1 sonnet :1793292026578, 1793292086578
    builder r1 sonnet :1793292086869, 1793293680869
    reviewer r1 sonnet :1793293684821, 1793293835821
```

<sub>Red: a review or audit that asked for a fix, or a gate that stayed red · highlighted: running now</sub>
