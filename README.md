# 🚀 QUICKDESK – Smart Ticket Management System

![QuickDesk Banner](https://readme-graphics.vercel.app/banner-quickdesk.svg)

Welcome to **QUICKDESK**, your modern helpdesk and ticketing solution designed for **students, developers, teams, and support agents**. This system lets users raise support tickets, track progress, and collaborate with admins or agents—all with a simple UI powered by **React, Node.js, MongoDB, and Bootstrap 5**.

---

## 📸 Preview

| 💡 Login | 🧾 Dashboard | 🛠️ Create Ticket |
|---------|--------------|------------------|
| ![Login](https://readme-graphics.vercel.app/quickdesk-login.gif) | ![Dashboard](https://readme-graphics.vercel.app/quickdesk-dashboard.gif) | ![Create](https://readme-graphics.vercel.app/quickdesk-create.gif) |

---

## 🛠️ Features

- 🔐 **JWT Authentication**
- 🧑‍💼 Role-based system: `user`, `agent`, `admin`
- 📨 Raise tickets by title, category, and description
- ✅ Track your own tickets only (secure fetch by user ID)
- 🔁 Logout securely and instantly
- 🎨 Responsive and clean **Bootstrap 5** UI

---

## 📁 Project Structure

```bash
QUICKDESK/
├── server/
│   ├── models/
│   ├── routes/
│   └── index.js
├── client/
│   ├── public/
│   ├── src/
│   │   ├── pages/     # Dashboard, Login, Register, Create
│   │   ├── components/
│   │   └── App.js
├── README.md
🚀 Getting Started
🔧 Prerequisites
Node.js >= 14.x

MongoDB (cloud/local)


💻 Tech Stack
Layer	Tech
Frontend	React, Bootstrap 5
Backend	Node.js, Express
Database	MongoDB + Mongoose
Auth	JWT (JSON Web Tokens)
Styling	Bootstrap, Custom CSS

📌 API Endpoints
🔐 Auth
POST /api/auth/register → Register new user

POST /api/auth/login → Login + token

🎫 Tickets
POST /api/tickets → Create new ticket

GET /api/tickets/user/:id → Get user-specific tickets

✅ Role-Based Design
Role	Permission
User	Create/View own tickets
Agent	(Future Scope) Assign/help
Admin	(Future Scope) All control

🪄 Future Enhancements
🔄 Ticket edit/update/delete



📢 Notifications

🔎 Admin analytics dashboard

💬 Comment system

📱 Mobile-first enhancements

💡 Credits
Made with ❤️ for the Odoo x CGC Hackathon 2025

Built by Manmeet Singh
Under the project theme: QuickDesk (Problem Statement 1)
