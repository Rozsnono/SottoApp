import { AuthForm } from "@/components/AuthForm";
import { register } from "@/state/session";

export default function Register() {
  return <AuthForm mode="register" onSubmit={register} />;
}
