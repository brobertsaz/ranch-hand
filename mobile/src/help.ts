// The Help screen's words. Bundled with the app so it reads fine with no signal.
// Button names match the app exactly; update them here when a label changes.

export type HelpTopic = { title: string; steps?: string[]; body?: string };
export type HelpSection = { title: string; intro?: string; topics: HelpTopic[] };

export const HELP: HelpSection[] = [
  {
    title: 'Before you ride out',
    topics: [
      {
        title: 'Join your ranch',
        steps: [
          'Ask whoever set up the ranch for the invite code. They find it on the Crew tab.',
          'Open Ranch Hand, type the code and your name, then tap Join the crew.',
          'Joining needs signal once. After that the app works without it.',
        ],
      },
      {
        title: 'Save the map for no signal',
        steps: [
          'At the house, with signal, move the map over the pastures you work.',
          'Tap the layers button on the map, then Download this area.',
          'It saves aerial and topo maps at least 5 km across. Do it again for each part of the ranch.',
        ],
      },
      {
        title: 'Get close-up aerial photos',
        steps: [
          'Zoom the map to one pasture, open the layers button and tap Sharpen this area.',
          "It tells you how long it'll take. Tap Sharpen to start or Cancel to back out.",
          'Watch the bar under Sharp areas. When it says Ready, tap Download so it works with no signal.',
          'Tap the X next to an area to stop it or take it off the list.',
        ],
      },
    ],
  },
  {
    title: 'Out on the ranch',
    topics: [
      {
        title: 'Log something you see',
        steps: [
          'Tap the red camera button. Get the ear tag or the problem in the photo and tap the shutter.',
          'Pick what it is: sick animal, feed, water, fence, gate or other.',
          "Tick what's wrong, add the tag number if there is one, then tap Drop the pin.",
          'No photo handy? Tap No photo on the camera screen.',
        ],
      },
      {
        title: 'Check a tank, feeder or gate',
        body:
          "Log it the same way while you're standing at it. If a place of that kind is close by, the check goes into that place's history. If not, the spot is saved as a new place. Ticking Full or Closed marks it all clear, so nobody gets sent out for nothing.",
      },
      {
        title: 'Add a place that stays put',
        steps: [
          'Tap the pin button with the plus on the right side of the map.',
          'Pick the kind, check the name (it fills in Water 3, Gate 2 and so on) and tap Save place.',
          "Not standing there? Tap Set it on the map instead, move the map until the spot is under the crosshair, then tap Put it here.",
        ],
      },
      {
        title: 'Find a pin someone dropped',
        steps: [
          'Tap the pin on the map, then tap its card.',
          'Tap Take me there. The arrow points straight at it and the distance counts down.',
          'When you get close it says Look around. Animals move, so check nearby.',
        ],
      },
      {
        title: 'Mark it fixed',
        body: "Open the pin and tap Mark resolved once it's doctored or fixed. Everyone sees it change on the next sync. Tap Reopen if it wasn't really fixed.",
      },
      {
        title: 'Record a ride, or follow one',
        steps: [
          'On the Rides tab, tap Start a ride. Your track draws on the map as you go.',
          'Tap Log what you see to drop a pin without stopping the ride.',
          'Press and hold Stop to end it, then give it a name like "To Water 1".',
          'To follow one, tap Show on map next to it on the Rides tab, then Follow this ride. The arrow keeps you on the trail.',
        ],
      },
    ],
  },
  {
    title: 'The crew',
    topics: [
      {
        title: 'Invite a hand',
        body: 'On the Crew tab, tap Share the code and send it however you like. They type it in when they first open Ranch Hand.',
      },
      {
        title: "What's new",
        body: 'The New tab lists what the rest of the crew found since you last looked, newest first. The red number is how many you haven\'t seen.',
      },
      {
        title: 'Syncing',
        body: 'Everything saves on your phone first. It sends to the crew on its own whenever you have signal or Wi-Fi. To push it right now, tap Sync on the New tab, or the gear on the Crew tab and then Sync now.',
      },
    ],
  },
  {
    title: 'What it means',
    topics: [
      { title: 'Round pin', body: 'A one-time sighting, like a sick cow. It may have moved since.' },
      { title: 'Square pin', body: 'A place that stays put: a tank, feeder, gate or fence line. Its history shows every check.' },
      { title: 'Dashed border on a pin', body: "It's only on your phone so far. It turns solid once it syncs." },
      { title: 'Red dot on a place', body: 'Its latest check found a problem nobody has fixed yet.' },
      { title: 'OPEN, RESOLVED and ALL CLEAR', body: 'OPEN needs someone. RESOLVED was fixed. ALL CLEAR was checked and fine.' },
      { title: 'Synced, Offline and "2 waiting"', body: 'The pill at the top right. Synced means the crew has everything. Offline or "2 waiting" means you have changes that send at the next signal.' },
      { title: 'Aerial and Topo', body: 'Aerial is photos of the ground. Topo shows contour lines, creeks, draws and section lines. Both come with every download.' },
      { title: 'Offline map and Sharp areas', body: 'An offline map is the whole area at normal detail. A sharp area adds close-up photos for one pasture. In Montana and Wisconsin they come from the state\'s own, sharper imagery.' },
      { title: 'GPS ±4 m', body: 'How sure your phone is about where you are. A smaller number is better. Step into the open if it says No GPS fix.' },
      { title: 'No compass, arrow is north-up', body: "Your phone can't tell which way it's facing, so the arrow points as if you face north. Start moving and it steers by your direction of travel." },
    ],
  },
];
