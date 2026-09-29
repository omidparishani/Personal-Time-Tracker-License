import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";

export default async function Home() {
  if (await isAdminAuthenticated()) redirect("/admin");
  redirect("/login");
}
