# Project Evergreen

Project Evergreen is an educational web platform focused on green hydrogen technology, clean energy infrastructure, and system design.

The website combines:
- A **static informational website** built with HTML/CSS/JavaScript
- An **interactive Hydrogen System Builder** built with React + Vite
- A Flask backend used for routing and serving pages

---

# Overview
The platform includes:

### 1. Main Informational Website
A static educational site explaining:
- What green hydrogen is
- How electrolysis works
- Renewable energy integration
- Hydrogen storage and fuel cells
- Sustainability and energy transition topics

### 2. Hydrogen System Builder
An interactive React-based tool allowing users to:
- Configure hydrogen production systems
- Select compatible infrastructure components
- Dynamically filter components
- Compare equipment specifications
- View compatibility warnings
- Estimate total system cost

---

# Tech Stack
### Backend
- Python
- Flask

### Frontend
#### Main Website
- HTML
- CSS
- JavaScript
#### Interactive Builder
- React
- Vite

---
# Installation

## 1. Clone the Repository

```bash
git clone <your-repo-url>
cd project
```
---
## 2. Create the Virtual Environment
```bash
python -m venv venv
```

Activate it:
### macOS/Linux:
```bash
source venv/bin/activate
```

### Windows:
```bash
venv\Scripts\activate
```
---
## 3. Install Flask
```bash
pip install flask
```
---
## 4. Install Dependencies
Move into the frontend directory and install npm packages:

```bash
cd frontend
npm install
```

---

# Running the Project
## Start the React/Vite Development Server
Inside /frontend:
```bash
npm run build
```

Vite will run at:
```bash
http://localhost:5173
```

## Start Flask
From the root project directory:
```bash
python app.py
```

Flask usually runs at:
```bash
http://127.0.0.1:5000
```

---
# Future Developments
- Save/export system builds
- User authentication
- Database integration
- Renewable energy calculators
- Electrolyzer sizing simulations
- Mobile responsive improvements
- Dark/light mode
- Real-world hydrogen production datasets

---
# Authors
Emily Tieu, Cameron Stump

