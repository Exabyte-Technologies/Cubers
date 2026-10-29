# Scoped finish review

Self-review of the requested pill rows, move grid and state-based lesson flow; this is not an independent full-app redesign review.

The supplied button shapes are the shared Chip component. Its groups are one horizontal row, preserving ordinary action rows. English rows overflow and scroll; the reviewed Chinese labels fit. Keyboard focus reveals Saved and Enter selects it with a solid visible outline and exposed pressed state.

The final 375px captures show all six 44-point move controls per row, adjacent inverse pairs and a separate self-inverse half-turn row. No last column is clipped. Other action buttons retain their stock shape and arrangement.

The active lesson shows the current target, turn explanation, actual sticker colors and pear next-turn action together on the reviewed phone viewport. The details action retains fuller explanations and holding information. Manual entry requires no camera. A cross-incomplete cube is refused by corners guidance and the matching lesson action navigates to cross. Server and simulated-device tests verify target-only completion and existing authority checks.

Final rendered lesson sweep: zero failures, one accent warning. The 5.8% paint estimate includes required puzzle sticker colors and the real next-turn action; these are functional surfaces retained by request. This warning is accepted for this scope. Two competition date-range copy notes are unchanged. The earlier broad Discover gate73 failure is a native-scroll clipping false positive, measured in .data/step-lessons/footer-clipping.json: the footer text is outside the scroll clip initially and fully visible/clickable afterward. It was not hidden or removed to satisfy the checker.

No physical camera/Bluetooth runtime, signed installation, public release or legal clearance is established. Those gates remain unchanged.
