import { test } from "node:test";
import assert from "node:assert/strict";
import { googleSignInAvailable } from "../server/google-sign-in";

test("Google availability never exposes an unconfigured provider and uses only the public key", async () => {
  const originalFetch = global.fetch;
  const previous = {
    mode: process.env.AUTH_MODE,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    enabled: process.env.GOOGLE_SIGN_IN_ENABLED,
  };
  let calls = 0;
  try {
    process.env.AUTH_MODE = "supabase";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
    delete process.env.GOOGLE_SIGN_IN_ENABLED;
    for (const enabled of [false, true]) {
      process.env.SUPABASE_URL = `https://provider-${enabled}.supabase.co`;
      global.fetch = async (input, init) => {
        calls++;
        assert.equal(
          String(input),
          `${process.env.SUPABASE_URL}/auth/v1/settings`,
        );
        assert.deepEqual(init?.headers, { apikey: "sb_publishable_test" });
        assert.equal(init?.cache, "no-store");
        return Response.json({ external: { google: enabled } });
      };
      assert.equal(await googleSignInAvailable(), enabled);
      assert.equal(await googleSignInAvailable(), enabled);
    }
    assert.equal(
      calls,
      2,
      "availability is cached briefly rather than repeatedly hitting Auth",
    );
    process.env.SUPABASE_URL = "https://provider-down.supabase.co";
    global.fetch = async () => {
      throw new Error("network unavailable");
    };
    assert.equal(await googleSignInAvailable(), false);
    process.env.GOOGLE_SIGN_IN_ENABLED = "false";
    assert.equal(await googleSignInAvailable(), false);
    process.env.AUTH_MODE = "local";
    delete process.env.GOOGLE_SIGN_IN_ENABLED;
    assert.equal(await googleSignInAvailable(), false);
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries({
      AUTH_MODE: previous.mode,
      SUPABASE_URL: previous.url,
      SUPABASE_PUBLISHABLE_KEY: previous.key,
      GOOGLE_SIGN_IN_ENABLED: previous.enabled,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
