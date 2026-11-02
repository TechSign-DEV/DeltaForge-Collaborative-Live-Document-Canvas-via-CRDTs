
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import api from "../services/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check existing authentication when the app loads
  useEffect(() => {
    let active = true;

    const checkAuth = async () => {
      const token = localStorage.getItem("deltaforge_token");

      if (!token) {
        if (active) setLoading(false);
        return;
      }

      try {
        const response = await api.get("/auth/me");

        if (active) {
          setUser(response.data.user);
        }
      } catch (error) {
        localStorage.removeItem("deltaforge_token");

        if (active) {
          setUser(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      active = false;
    };
  }, []);

  // Save authentication response
  const saveAuth = (data) => {
    if (!data?.token || !data?.user) {
      throw new Error("Invalid authentication response from server");
    }

    localStorage.setItem("deltaforge_token", data.token);
    setUser(data.user);

    return data;
  };

  // Register
  const register = async (formData) => {
    const response = await api.post("/auth/register", formData);

    return saveAuth(response.data);
  };

  // Login
  const login = async (formData) => {
    const response = await api.post("/auth/login", formData);

    return saveAuth(response.data);
  };

  // Logout
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Logout API error:", error);
    } finally {
      localStorage.removeItem("deltaforge_token");
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        register,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};
