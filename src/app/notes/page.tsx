import { redirect } from "next/navigation";

export default function NotesRedirectPage() {
  redirect("/?tab=notes");
}
