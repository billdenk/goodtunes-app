    ## HANDOFF: Press vinyl color tool + gradient ramp (from Andrew)

    Andrew approved the "Rebuild this color" tool on the press vinyl
    mockup screen. File: handoff/PressVinylPhotoshopMockup.tsx (this
    commit) plus its disc/logo assets in handoff/assets/. Handoff law
    applies: delete-first, presentational code verbatim, wire data only,
    both themes, screenshot diff at 1440/1024/768. Build the color tool
    and the gradient slider/ramp EXACTLY as mocked - no re-derivation.

    Must work (everything else is decorative chrome):
    - Color popover tabs: Wheel / Spectrum / Sliders / Swatches all switch and function
    - Wheel: draggable pick point on the wheel + the horizontal lightness ramp beneath it; swatch preview updates live
    - Eyedropper button samples from the uploaded reference photo
    - Cancel / Select: Select commits the picked color to the active gradient stop
    - Gradient vs Advanced Gradient toggle switches ramp modes
    - Gradient ramp: stops are draggable; clicking a stop opens the color popover for that stop; the hex chip (#916818) reflects and accepts the active stop's value
    - Style row ("Metallic Blend") + Change style swaps the finish style and the disc render follows
    - Name field ("HB01 Metallic Gold") is editable; Replace is the ONE filled action - commits the rebuilt color over the press's suggested match
    - Compare their photo toggles the side-by-side with the press's uploaded reference
    - Size chips 12" / 10" / 7" re-render the disc at that size
    - Disc preview re-renders live from every change above (color, gradient, style)

    Wiring note: the mock's SVG disc stand-ins swap 1:1 for the real
    renders per the established vinyl-generator contract; artists never
    see raw hex anywhere outside this press-side tool.

    PROD: Andrew wants this screen in the next Publish. After it lands
    and passes acceptance, tell Bill it's ready so the next Publish
    includes it.
    