import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema({
  title: String,
  description: String,
  category: String,
  status: { type: String, enum: ['Open', 'In Progress', 'Resolved', 'Closed'], default: 'Open' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }],
  upvotes: { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  attachmentURL: String,
}, { timestamps: true });

export default mongoose.model('Ticket', ticketSchema);