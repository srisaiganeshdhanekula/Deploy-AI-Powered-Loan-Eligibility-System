

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { loanAPI } from '../utils/api';

const UserNotifications = ({ userId }) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [read, setRead] = useState(false);
  const ref = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    function handleClickOutside(event) {
      // Always close if click is outside the dropdown or the bell button
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    // Fetch user's loan applications (last 5 for demo)
    loanAPI.getLastApplication()
      .then(res => {
        // If backend returns a list, use it; else wrap single app in array
        let data = res.data;
        if (!Array.isArray(data)) data = [data];
        setNotifications(data);
      })
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [userId]);

  const count = notifications.length;
  const unreadCount = read ? 0 : count;

  return (
    <div className="relative flex items-center" ref={ref}>
      <button
        className="relative focus:outline-none"
        aria-label="User Notifications"
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Bell Icon SVG */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-gray-600 hover:text-blue-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {/* Notification Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>
      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-14 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-gray-800">Loan Notifications</h4>
            {unreadCount > 0 && (
              <button
                className="text-xs text-blue-500 underline hover:text-blue-700"
                onClick={() => setRead(true)}
              >
                Mark all as read
              </button>
            )}
          </div>
          {loading ? (
            <div className="text-gray-400">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="text-gray-400">No notifications.</div>
          ) : (
            <ul className="space-y-3">
              {notifications.map((notif, idx) => (
                <li key={notif.id || idx} className="flex flex-col gap-1 border-b pb-2 last:border-b-0 last:pb-0">
                  <span className="font-medium text-gray-700">
                    Loan for ₹{notif.loan?.toLocaleString?.() || notif.loan} - <span className={notif.result === 'Eligible' ? 'text-green-600' : 'text-red-600'}>{notif.result === 'Eligible' ? 'Accepted' : 'Rejected'}</span>
                  </span>
                  <span className="text-xs text-gray-500">Applied on: {notif.date || notif.created_at || 'N/A'}</span>
                  {notif.result !== 'Eligible' && (
                    <button
                      className="text-xs text-blue-600 underline mt-1 self-start hover:text-blue-800"
                      onClick={() => { setOpen(false); navigate(`/loan-rejection/${notif.user_id || notif.userId || ''}`); }}
                    >
                      See why
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default UserNotifications;
