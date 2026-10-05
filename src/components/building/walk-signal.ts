/**
 * Requests from the page UI to the walker, kept free of three.js so the page bundle stays light.
 * `riding`: the doors are shut and the cabin is moving; the walker stays put. `arrive`: the next
 * zone change is the end of a ride, so the walker appears inside that zone's cabin.
 */
export const WALK_SIGNAL = { goElevator: false, riding: false, arrive: false };
