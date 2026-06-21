# Vexel Landing System Design

## Goal

Apply the licensed Vexel reference site's complete visual system to AgentPay's landing page without changing AgentPay's real payment behavior or product claims.

## Foundation

- DM Sans 200-500 for navigation, headings, body copy and buttons.
- Geist Mono for wallet balances, payment stages and terminal output.
- True black and white section bands; cyan is reserved for the WebGL model and live protocol details.
- Heading scale follows the reference: 64px hero, 48px section headings and 36px feature headings on desktop.

## Composition

- Transparent fixed navigation.
- Full-viewport WebGL hero.
- Live command surface overlaps the black-to-white boundary.
- White proof area uses three product values rather than five technical cards.
- Dark section uses alternating decision and receipt stories.
- Service classes use an asymmetric bento layout.
- Final action receives a full, quiet white viewport.

## Constraints

- Existing API calls, paid-agent stream, live wallet data and receipt links remain real and unchanged.
- No mock metrics or simulated payment state is introduced.
- Mobile retains the same content order and real command data in a compressed layout.

