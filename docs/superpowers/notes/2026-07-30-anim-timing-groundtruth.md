# PowerPoint animation ground truth (click-to-reveal + countdown bar)

Captured 2026-07-30 by driving PowerPoint itself over COM (`New-Object -ComObject
PowerPoint.Application`), saving a .pptx and reading the slide XML back. Never hand-write timing XML
— the YouTube spike proved one dropped tag hard-corrupts the file. Same rule here.

How it was captured (PowerShell, needs the sandbox off for COM):

```powershell
$slide = $pres.Slides.Add(1, 12)                       # ppLayoutBlank
$trigger = $slide.Shapes.AddShape(5, 40, 40, 200, 50)  # rounded rect
$reveal  = $slide.Shapes.AddTextbox(1, 40, 120, 500, 80)
$bar     = $slide.Shapes.AddShape(1, 40, 300, 600, 24)

# click-to-reveal: interactive sequence, Appear entrance, fired by clicking $trigger
$eff = $slide.TimeLine.InteractiveSequences.Add().AddEffect($reveal, 1, 0, 4)  # 1=Appear, 4=OnShapeClick
$eff.Timing.TriggerShape = $trigger

# countdown: exit Wipe on the bar, starts with the slide, runs 180s
$eff2 = $slide.TimeLine.MainSequence.AddEffect($bar, 22, 0, 2)                 # 22=Wipe, 2=WithPrevious
$eff2.Exit = $true
$eff2.EffectParameters.Direction = 8
$eff2.Timing.Duration = 180
$pres.SaveAs($out, 24)                                                          # ppSaveAsOpenXMLPresentation
```

## What PowerPoint wrote

**Durations are milliseconds in the XML.** `Timing.Duration = 180` (seconds, COM) came back as
`<p:cTn id="6" dur="180000">`. A long duration sticks — a 3-minute wipe is legal and is what makes
the bar read as a countdown. (In the FIRST capture the duration silently stayed at the 500ms default;
the difference was setting `Exit` before `Timing.Duration`. Always read the value back.)

**Wipe direction, measured** (`EffectParameters.Direction` → `presetSubtype` / `filter`):

| Direction | presetSubtype | filter |
|---|---|---|
| 1 | 1 | `wipe(up)` |
| 2 | 2 | `wipe(right)` |
| 3 | 4 | `wipe(down)` |
| 4 | 8 | `wipe(left)` |

For a bar that drains right-to-left (time remaining stays on the left) use `presetSubtype="8"` /
`filter="wipe(left)"`.

**Both effects.** This is capture 1's structure verbatim, with two values swapped in from capture 2
(`presetSubtype="8"` / `filter="wipe(left)"`, and `dur="180000"` with its paired `delay` moved to
`179999`) — every one of those was measured, not invented. spid 2 = trigger, 3 = reveal text, 4 = bar.
`<p:timing>` goes immediately before `</p:sld>`; `<p:bldLst>` is part of it.

```xml
<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="5" presetID="22" presetClass="exit" presetSubtype="8" fill="hold" grpId="0" nodeType="withEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:animEffect transition="out" filter="wipe(left)"><p:cBhvr><p:cTn id="6" dur="180000"/><p:tgtEl><p:spTgt spid="4"/></p:tgtEl></p:cBhvr></p:animEffect><p:set><p:cBhvr><p:cTn id="7" dur="1" fill="hold"><p:stCondLst><p:cond delay="179999"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="4"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq><p:seq concurrent="1" nextAc="seek"><p:cTn id="8" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cond></p:stCondLst><p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst><p:par><p:cTn id="9" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="10" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="11" presetID="1" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="12" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="3"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:nextCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="2"/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst><p:bldLst><p:bldP spid="3" grpId="0"/><p:bldP spid="4" grpId="0" animBg="1"/></p:bldLst></p:timing>
```

Notes for the injector:

- An **entrance** effect means the target is invisible in the slideshow until it fires, but still
  visible in the normal editing view — which is what we want: the teacher sees the reveal while
  planning, the class doesn't until it's clicked.
- The two `<p:seq>` blocks are independent: a slide can carry the countdown, the reveal, or both.
  Renumber `p:cTn/@id` sequentially per slide when combining.
- `<p:bldLst>` must list every animated shape (`animBg="1"` for a filled shape).
