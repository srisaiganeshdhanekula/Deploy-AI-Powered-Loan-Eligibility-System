// Deprecated: This component is no longer used. Auth flow lives in pages/AuthPage.jsx with OTP integration.
export default function LoginForm() {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(
      "Deprecated component LoginForm rendered. Use AuthPage instead."
    );
  }
  return null;
}
