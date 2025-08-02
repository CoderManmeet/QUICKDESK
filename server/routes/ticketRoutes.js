import express from 'express';
import Ticket from '../models/Ticket.js';

const router = express.Router();

// Create Ticket
router.post('/', async (req, res) => {
  const { title, description, category, createdBy } = req.body;
  try {
    const ticket = await Ticket.create({ title, description, category, createdBy });
    res.status(201).json(ticket);
  } catch (err) {
    res.status(400).json({ message: 'Ticket creation failed' });
  }
});

// Get Tickets for User
router.get('/user/:id', async (req, res) => {
  try {
    const tickets = await Ticket.find({ createdBy: req.params.id });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching tickets' });
  }
});

export default router;