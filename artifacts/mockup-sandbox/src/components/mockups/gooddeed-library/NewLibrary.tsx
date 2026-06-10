import { Phone, StackLibraryGrid } from "./_shared";

// Direction 2 · Library — multi-copy albums read as a STACK of artwork
// (back copy straight, front cover tilted left), the way the old web app did
// it. No number on the cover; the stack alone signals "you own several."
export default function NewLibrary() {
  return (
    <Phone title="Library">
      <StackLibraryGrid />
    </Phone>
  );
}
