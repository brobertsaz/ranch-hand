import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { errorText } from './api';
import { renameRide, type Ride } from './db';
import type { LngLat } from './format';
import { activeRide, resumeRideIfNeeded, ridePoints, startRide, stopRide, type ActiveRide } from './rides';

// The ride being named: right after it stops, or from its card
export type NamingRide = { id: string; track: LngLat[]; name: string };

// The ride in progress, the saved ride drawn on the map, and the one being followed. What each of these
// does to the rest of the map (the tab, the camera, the selected pin) is the map's business: begin, end
// and saveName call back at the moment the map should act.
export function useRideState(memberId: string, rides: Ride[]) {
  // The ride picked from the Rides tab, drawn on the map until closed
  const [shownRideId, setShownRideId] = useState<string | null>(null);
  // The ride in progress and its track, re-read every few seconds
  const [ride, setRide] = useState<ActiveRide | null>(null);
  const [liveTrack, setLiveTrack] = useState<LngLat[]>([]);
  // A saved ride someone is following, track and all
  const [followRideId, setFollowRideId] = useState<string | null>(null);
  const [naming, setNaming] = useState<NamingRide | null>(null);

  useEffect(() => {
    const refresh = async () => {
      const active = await activeRide();
      setRide(active);
      setLiveTrack(active ? await ridePoints(active.id) : []);
    };
    // The ride is still on screen as recording, so say so if it isn't
    resumeRideIfNeeded().catch((error) =>
      Alert.alert("Your ride isn't recording", `${errorText(error)} Hold Stop to save what was recorded so far, then start a new ride.`),
    );
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const shownRide = rides.find((r) => r.id === shownRideId) ?? null;
  const followRide = rides.find((r) => r.id === followRideId) ?? null;
  const followTrack = useMemo(() => (followRide ? (JSON.parse(followRide.track) as LngLat[]) : []), [followRide]);

  // onStarted: the ride is recording, so the map can turn to it
  async function begin(onStarted: () => void) {
    try {
      const started = await startRide();
      setRide(started);
      setLiveTrack([]);
      setShownRideId(null);
      onStarted();
    } catch (error) {
      Alert.alert("Couldn't start the ride", (error as Error).message);
    }
  }

  // onSaved: the ride is saved and showing, and here is its track to fit on screen
  async function end(onSaved: (track: LngLat[]) => void) {
    const track = liveTrack;
    let saved;
    try {
      saved = await stopRide(memberId);
    } catch {
      // stopRide turns location updates off before it saves. If the save failed the ride is still on screen
      // as recording, so make that true again, or say plainly that it isn't.
      const recording = await resumeRideIfNeeded().then(() => true, () => false);
      Alert.alert(
        "Couldn't save the ride",
        recording ? "It's still recording. Hold Stop to try again." : "It has stopped recording, but what was recorded is still on this phone. Hold Stop to try saving it again.",
      );
      return;
    }
    setRide(null);
    setLiveTrack([]);
    if (!saved) {
      Alert.alert('Nothing to save', "The phone didn't get enough GPS fixes to draw a track.");
      return;
    }
    // Leave the finished ride on the map, with its card, and offer to name it
    setShownRideId(saved.id);
    onSaved(track);
    setNaming({ id: saved.id, track, name: '' });
  }

  async function saveName(name: string, onSaved: () => void) {
    try {
      if (naming) await renameRide(naming.id, name);
    } catch {
      return Alert.alert("Couldn't save the name", 'The phone had trouble saving it. Try again.');
    }
    setNaming(null);
    onSaved();
  }

  return {
    ride, liveTrack, shownRide, followRide, followTrack, naming,
    show: setShownRideId, follow: setFollowRideId, setNaming, begin, end, saveName,
  };
}
