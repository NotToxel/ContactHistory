# Contact History visual system

The interface uses Material 3 color roles and rounded, adaptive components. Its blue primary color signals navigation and actions; cool neutral surfaces keep dense contact data readable. A muted green identifies local privacy and healthy connection states.

| Role | Light value | Use |
| --- | --- | --- |
| Primary | `#345c8c` | Main actions, active icons, links |
| On primary | `#ffffff` | Text and icons on primary |
| Primary container | `#d7e8ff` | Selected navigation, quiet emphasis |
| Surface | `#f8f9ff` | Workspace background |
| Surface low | `#f1f4fa` | Navigation and supporting areas |
| Surface bright | `#ffffff` | Forms and data panels |
| On surface | `#1a1d24` | Main text |
| On surface variant | `#4b5664` | Supporting text |
| Outline variant | `#c5ceda` | Dividers and input outlines |
| Error | `#9d2b39` | Error text |

Colors are defined as CSS custom properties in [src/style.css](src/style.css). The palette is used across the navigation drawer, onboarding, archive browser, change comparison, and settings. DM Sans and Manrope are bundled locally for offline use.

Use 13–16 px rounded corners for large surfaces, 10–13 px for controls, and a pill only for compact status labels. Selected navigation uses a tonal fill; primary buttons use the solid primary color. Keep a visible keyboard focus ring and honor reduced motion.
