import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { deleteObservation, normalizeTag, photosFor, updateObservation, type Kind, type Observation, type ObservationFix } from '../db';
import { dayAndTime } from '../format';
import { composeNote, initialStatus, PLACE_KIND, splitNote } from '../kinds';
import { photoFile } from '../photoFiles';
import { tagHint } from '../tags';
import TagScreen from './TagScreen';

type Props = {
  observation: Observation;
  // Only the hand who logged it and the owner can throw a pin away (the server agrees)
  canDelete: boolean;
  onDone: (outcome: 'saved' | 'deleted' | 'cancelled') => void;
};

// Putting right a pin that was logged wrong: the kind, what's ticked, the tag, the note. Where and when it
// was logged, and its photo, stay as they are.
export default function EditObservationScreen({ observation, canDelete, onDone }: Props) {
  const was = splitNote(observation.kind, observation.note);
  const [kind, setKind] = useState<Kind>(observation.kind);
  const [picks, setPicks] = useState<string[]>(was.picks);
  const [tagNumber, setTagNumber] = useState(observation.tag_number ?? '');
  const [note, setNote] = useState(was.extra ?? '');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    photosFor(observation.id).then((photos) => setPhotoUri(photos.map((p) => photoFile(p.id)).find((f) => f.exists)?.uri ?? null));
  }, [observation.id]);

  useEffect(() => {
    let stale = false;
    tagHint(tagNumber, observation.id).then((text) => !stale && setHint(text));
    return () => {
      stale = true;
    };
  }, [tagNumber, observation.id]);

  // Only what actually changed is named as edited, so a teammate's change to anything else still wins
  function changes(): Partial<ObservationFix> {
    const next: Partial<ObservationFix> = {};
    const tag = kind === 'sick_animal' ? normalizeTag(tagNumber) : null;
    const text = composeNote(picks, note);
    if (kind !== observation.kind) next.kind = kind;
    if (tag !== observation.tag_number) next.tag_number = tag;
    if (text !== observation.note) next.note = text;
    // A check reads differently now ("Full" put right to "Low"). Resolved stays resolved: someone dealt with it.
    const status = initialStatus(kind, picks);
    if (observation.status !== 'resolved' && status !== observation.status && (next.kind || next.note !== undefined)) next.status = status;
    // A sick animal doesn't belong in a water tank's history
    if (observation.waypoint_id && PLACE_KIND[kind] !== PLACE_KIND[observation.kind]) next.waypoint_id = null;
    return next;
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const next = changes();
      await updateObservation(observation.id, next);
      onDone(Object.keys(next).length > 0 ? 'saved' : 'cancelled');
    } catch {
      Alert.alert("Couldn't save that", 'The phone had trouble saving. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this pin?', 'It comes off the map for the whole crew, with its photo. This can’t be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteObservation(observation.id);
            onDone('deleted');
          } catch {
            Alert.alert("Couldn't delete that", 'The phone had trouble saving. Try again.');
          }
        },
      },
    ]);
  }

  return (
    <TagScreen
      photoUri={photoUri}
      fix={null}
      kind={kind}
      onKind={(next) => {
        // Each kind has its own list, so picks from the last one don't carry over
        if (next !== kind) setPicks([]);
        setKind(next);
      }}
      place={null}
      picks={picks}
      onTogglePick={(pick) => setPicks((current) => (current.includes(pick) ? current.filter((p) => p !== pick) : [...current, pick]))}
      tagNumber={tagNumber}
      onTagNumber={setTagNumber}
      note={note}
      onNote={setNote}
      tagHint={hint}
      saving={saving}
      onSave={save}
      onCancel={() => onDone('cancelled')}
      editing={{ where: `Logged ${dayAndTime(observation.observed_at)}`, onDelete: canDelete ? confirmDelete : undefined }}
    />
  );
}
