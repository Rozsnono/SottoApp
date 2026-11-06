import { router } from "expo-router";
import { AuthForm } from "@/components/AuthForm";
import { login } from "@/state/session";

export default function Login() {
  return <AuthForm mode="login" onSubmit={async (u, p) => { await login(u, p); router.replace("/restore"); }} />;
}
