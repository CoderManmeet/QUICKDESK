import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Dashboard() {
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    const fetchTickets = async () => {
      const token = localStorage.getItem('token');
      const { data: user } = JSON.parse(atob(token.split('.')[1]));
      const res = await axios.get(`http://localhost:5000/api/tickets/user/${user.id}`);
      setTickets(res.data);
    };
    fetchTickets();
  }, []);

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-4">My Tickets</h2>
      <ul className="space-y-4">
        {tickets.map(ticket => (
          <li key={ticket._id} className="border p-4 rounded">
            <h3 className="text-lg font-semibold">{ticket.title}</h3>
            <p>{ticket.description}</p>
            <p className="text-sm text-gray-500">Category: {ticket.category} | Status: {ticket.status}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}