// Authentication utility functions
const ACCESS_TOKEN_KEY = "access_token";
const USER_KEY = "user";

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function isExpired(token) {
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return false; // if no exp, assume not expired
  const now = Math.floor(Date.now() / 1000);
  return payload.exp <= now;
}

export const auth = {
  // Get stored token (prefers localStorage, then sessionStorage) and validate expiry
  getToken: () => {
    let token =
      localStorage.getItem(ACCESS_TOKEN_KEY) ||
      sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (token && isExpired(token)) {
      // Clear expired tokens from both stores
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      token = null;
    }
    return token;
  },

  // Set token: remember=true stores in localStorage, else sessionStorage
  setToken: (token, remember = true) => {
    // Remove from both, then set in chosen storage
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(ACCESS_TOKEN_KEY, token);
  },

  // Remove token
  removeToken: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  },

  // Get stored user (prefers localStorage, then sessionStorage)
  getUser: () => {
    const str =
      localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    try {
      return str ? JSON.parse(str) : null;
    } catch {
      return null;
    }
  },

  // Set user alongside token location (mirror where the token is)
  setUser: (user, remember = true) => {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(USER_KEY, JSON.stringify(user));
  },

  // Remove user
  removeUser: () => {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
  },

  // Check if user is authenticated
  isAuthenticated: () => !!auth.getToken(),

  // Check if user is manager
  isManager: () => {
    const user = auth.getUser();
    return user && user.role === "manager";
  },

  // Logout
  logout: () => {
    auth.removeToken();
    auth.removeUser();
    window.location.href = "/";
  },
};
