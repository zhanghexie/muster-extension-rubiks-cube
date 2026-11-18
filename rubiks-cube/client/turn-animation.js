// Keeps a local drag commit from being mistaken for a new external move.
// The domain event can arrive after the pointer animation has finished; in
// that case the committed face state must be painted in place, never replayed
// from fraction 0.
export function createTurnAnimationGate() {
  let localCommit = false;
  let skipExternalTransition = false;
  return {
    beginLocalCommit() {
      localCommit = true;
      skipExternalTransition = true;
    },
    onFacesUpdate() {
      if (localCommit) {
        // The event arrived while the pointer-up handler is still awaiting the
        // domain command. The settle animation already owns the visual state.
        skipExternalTransition = false;
        return 'local';
      }
      if (skipExternalTransition) {
        skipExternalTransition = false;
        return 'local';
      }
      return 'external';
    },
    endLocalCommit(succeeded = true) {
      localCommit = false;
      if (!succeeded) skipExternalTransition = false;
    }
  };
}
