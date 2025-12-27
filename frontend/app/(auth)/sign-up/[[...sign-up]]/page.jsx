import { SignUp } from "@clerk/nextjs";

export default function Page() {
	return (
		<SignUp
			afterSignInUrl="/dashboard"
			afterSignUpUrl="/dashboard"
			appearance={{
				variables: {
					colorBackground: "white",
				},
			}}
		/>
	);
}
