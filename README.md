<div  align="center">

# Minerva Backend API

**The robust, high-performance backend API that powers the Minerva platform, handling everything from AI recommendations to secure document storage and user authentication.**

<p>

<img  src="https://img.shields.io/badge/Bun-1.1-black?style=flat-square&logo=bun"  alt="Bun"/> <img  src="https://img.shields.io/badge/ElysiaJS-1.1-purple?style=flat-square&logo=elysia"  alt="ElysiaJS"/> <img  src="https://img.shields.io/badge/MongoDB-6.0-47A248?style=flat-square&logo=mongodb"  alt="MongoDB"/> <img  src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript"  alt="TypeScript"/> <img  src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square"  alt="License"/>

</p>

[Overview](#overview) &nbsp;&bull;&nbsp; [Features](#key-features) &nbsp;&bull;&nbsp; [Demo](#live-demo) &nbsp;&bull;&nbsp; [Installation](#installation) &nbsp;&bull;&nbsp; [API Docs](#api-documentation)

</div>

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/list.svg"  width="24"  height="24"  align="center"/> Table of Contents

- [Overview](#overview)

- [The Problem](#the-problem)

- [Our Solution](#our-solution)

- [Key Features](#key-features)

- [Live Demo](#live-demo)

- [Tech Stack](#tech-stack)

- [Architecture](#architecture)

- [Installation](#installation)

- [API Documentation](#api-documentation)

- [Deployment](#deployment)

- [Team](#team)

- [Acknowledgments](#acknowledgments)

- [Contact & Support](#contact--support)

- [Project Status](#project-status)

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/info.svg"  width="24"  height="24"  align="center"/> Overview

Minerva Backend is a high-performance RESTful API built on top of Bun and ElysiaJS. It serves as the data and business logic foundation for the Minerva ecosystem, orchestrating complex workflows such as AI-driven document reviews, IELTS test evaluations, secure user authentication, and comprehensive scholarship data management.

<hr/>

## <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXRyaWFuZ2xlLWFsZXJ0LWljb24gbHVjaWRlLXRyaWFuZ2xlLWFsZXJ0Ij48cGF0aCBkPSJtMjEuNzMgMTgtOC0xNGEyIDIgMCAwIDAtMy40OCAwbC04IDE0QTIgMiAwIDAgMCA0IDIxaDE2YTIgMiAwIDAgMCAxLjczLTMiLz48cGF0aCBkPSJNMTIgOXY0Ii8+PHBhdGggZD0iTTEyIDE3aC4wMSIvPjwvc3ZnPg=="  width="24"  height="24"  align="top"  /> The Problem

Students often use multiple websites and services to search for scholarships, review application documents, prepare for language tests, and find mentors. This creates several problems:

- Scholarship information is scattered across different platforms.

- Students don’t know which scholarships match their profiles.

- Scholarship requirements may be difficult to understand.

- Documents may not meet scholarship standards.

- Scholarship time-window may be difficult to track.

- Students have limited access to interview and test preparation.

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/lightbulb.svg"  width="24"  height="24"  align="center"/> Our Solution

Minerva's backend replaces fragmented systems by providing a centralized, extremely fast API layer. Designed with a modular architecture, it bridges frontend requests with a secure MongoDB data store. Utilizing ElysiaJS ensures end-to-end type safety, while our integration with advanced AI models allows for real-time essay analysis and test preparation feedback. Every endpoint is thoroughly documented via an auto-generated Swagger interface.

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/star.svg"  width="24"  height="24"  align="center"/> Key Features

Based on the implemented modules and core capabilities, the backend offers the following features:

### Core Architecture & Security

- **Field-Level Encryption (FLE)**: Sensitive user data (like phone numbers) is securely encrypted at rest within MongoDB.

- **Modular Domain-Driven Design**: Logic is strictly separated into distinct modules (e.g., `/auth`, `/applications`, `/ielts`) for maintainability.

### AI & Integrations

- **Document Processing**: Built-in parsers (using Mammoth) to extract and evaluate text from uploaded resumes and essays.

- **Automated Evaluations**: Endpoints dedicated to processing mock IELTS speaking and writing submissions through advanced LLMs.

### Developer Experience

- **Auto-generated Swagger Docs**: Explore and test all endpoints dynamically via the `/swagger` UI.

- **Elysia Eden Ready**: Exposes strict TypeBox schemas allowing the frontend to consume the API with zero-friction type safety.

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/monitor.svg"  width="24"  height="24"  align="center"/> Live Demo

### 🔗 Access Minerva Backend

- **Production API URL**: [https://api.minerva.ac.id/](https://api.minerva.ac.id/)

- **Swagger Docs**: [https://api.minerva.ac.id/swagger](https://api.minerva.ac.id/swagger)

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/layers.svg"  width="24"  height="24"  align="center"/> Tech Stack

The backend application is built on a modern, high-performance web stack:

### Core Framework & Runtime

- **Runtime**: Bun (v1.3+)

- **Framework**: ElysiaJS

- **Language**: TypeScript strict mode

### Database & ORM

- **Database**: MongoDB Atlas

- **ORM**: Mongoose (with custom encryption hooks)

### Tooling & Utilities

- **API Documentation**: @elysiajs/swagger

- **Document Parsing**: mammoth

- **Testing**: bun test

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/share-2.svg"  width="24"  height="24"  align="center"/> Architecture

The diagram below outlines the core backend request lifecycle and modular structure:

```mermaid



flowchart TD



%% Define Client Entry

Client((Frontend / Eden Client))



%% Core API Layer

subgraph API [ElysiaJS Application Layer]

Router[app.ts Router]

subgraph Modules [Domain Modules]

Auth["/auth"]

Scholarships["/scholarships"]

Applications["/applications"]

IELTS["/ielts"]

Documents["/documents"]

Mentors["/mentors"]

AI["/ai"]

end

Swagger[Swagger Docs /swagger]

end



%% Data Layer

subgraph Data [Data Layer]

Mongoose[Mongoose Models]

MongoDB[(MongoDB Atlas)]

end



%% External Integrations

subgraph External [External Services]

LLM[OpenAI / AI Models]

Storage[Document Storage]

end



%% Connections

Client -->|HTTPS| Router

Router -->|Routes Request| Modules

Modules -->|CRUD Operations| Mongoose

Mongoose -->|Encrypted Data| MongoDB

Modules -->|AI Prompts| LLM

Modules -->|Uploads| Storage



Client -.Options.-> Swagger



```

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/terminal.svg"  width="24"  height="24"  align="center"/> Installation

Follow these steps to set up the development environment locally:

1.  **Clone the repository:**

```bash



git  clone  https://github.com/YangHansen/project-minerva-be.git



cd  project-minerva-be



```

2.  **Configure Environment Variables:**

Copy the example environment file and configure it. Ensure `MONGODB_URI` and `SESSION_SECRET` are set.

```bash



cp  .env.example  .env



```

3.  **Install Dependencies:**

The project utilizes Bun as its package manager.

```bash



bun  install



```

4.  **Start the Development Server:**

```bash



bun  run  dev



```

The application will be available at `http://localhost:3000`.

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/server.svg"  width="24"  height="24"  align="center"/> API Documentation

The backend automatically generates interactive OpenAPI documentation using the `@elysiajs/swagger` plugin.

- **Swagger UI**: Accessible by navigating to `http://localhost:3000/swagger` while the development server is running. This provides a dynamic interface to test endpoints and view schemas.

- **Eden Treaty**: By leveraging Elysia's TypeBox integration, the backend securely exports end-to-end type definitions, which the Minerva frontend consumes directly without writing manual fetch calls.

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/cloud.svg"  width="24"  height="24"  align="top"  /> Deployment

The backend application is containerized and hosted securely on **Render**.

- **Hosting & CI/CD:** Deployed as a web service via Docker, automatically building and launching upon successful merges to the main branch.

- **Database:** Connects to a dedicated MongoDB Atlas cluster tailored for high-availability and encrypted data storage.

_(Note: The companion frontend application is hosted independently on Cloudflare Pages.)_

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/users.svg"  width="24"  height="24"  align="center"/> Team

**Minerva** is developed by **HERMES Team** as part of our capstone project.

<table>
  <tr>
    <td align="center">
      <img src="https://img.shields.io/badge/Fullstack-Developer-blue?style=flat-square" alt="Role"/><br/>
      <b>Bridget Beatrix Claire</b><br/>
      <a href="https://linkedin.com/in/bridget-claire">
        <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin" alt="LinkedIn"/>
      </a><br/>
    </td>
    <td align="center">
      <img src="https://img.shields.io/badge/Project Manager-QA-purple?style=flat-square" alt="Role"/><br/>
      <b>Hansen</b><br/>
      <a href="https://linkedin.com/in/Hansen">
        <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin" alt="LinkedIn"/>
      </a><br/>
    </td>
    <td align="center">
      <img src="https://img.shields.io/badge/QA Lead & Testing-Backend-green?style=flat-square" alt="Role"/><br/>
      <b>Mutya Qurratu'ayuni Mustafa</b><br/>
      <a href="https://linkedin.com/in/Mutya-Qurratuayuni-Mustafa">
        <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin" alt="LinkedIn"/>
      </a><br/>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://img.shields.io/badge/Tech Lead-QA-orange?style=flat-square" alt="Role"/><br/>
      <b>Syafira Al Atika</b><br/>
      <a href="https://linkedin.com/in/Syafira-Al-Atika">
        <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin" alt="LinkedIn"/>
      </a><br/>
    </td>
    <td align="center">
      <img src="https://img.shields.io/badge/Data Analyst-Documentation%20%26%20DevOps-red?style=flat-square" alt="Role"/><br/>
      <b>Tsabitah Dinniyah</b><br/>
      <a href="https://linkedin.com/in/tsabitahdinniyah">
        <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin" alt="LinkedIn"/>
      </a><br/>
    </td>
    </td>
    <td align="center">
            <img src="https://img.shields.io/badge/Fullstack-Developer-blue?style=flat-square" alt="Role"/><br/>
      <b>Yusril Zubaydi</b><br/>
      <a href="https://linkedin.com/in/yusril-zubaydi">
        <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=flat-square&logo=linkedin" alt="LinkedIn"/>
      </a><br/>
    </td>
  </tr>
</table>

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/award.svg"  width="24"  height="24"  align="center"/> Acknowledgments

- **Sustainable Development Goals (SDG 4)** for inspiring our mission

- **OpenAI** for embedding models

- **MongoDB Atlas** for database hosting

- **All open-source contributors** whose libraries made this possible

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/mail.svg"  width="24"  height="24"  align="center"/> Contact & Support

**Email**: minerva.ai@keemail.me

<hr/>

## <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/activity.svg"  width="24"  height="24"  align="center"/> Project Status

**Current Version**: 1.0.0 (MVP Ready)

**Roadmap**:

- [x] **Phase 1: Core Architecture & Data** (Authentication, Normalized Scholarship Database)

- [x] **Phase 2: Intelligent Discovery** (AI Recommendations, Search & Filtering)

- [x] **Phase 3: Unified Workspace** (Checklist Tracker & Document Management Bridge)

- [x] **Phase 4: Preparation & Mentorship** (AI CV/Essay Reviews, IELTS Simulations, Mentor Booking)

- [x] **Phase 5: MVP Deployment** (Cloudflare & Render Infrastructure)

- [ ] **Phase 6: Advanced Ecosystem** (Real Payment Processing, Direct University Portal Integrations)

- [ ] **Phase 7: Global Scaling** (Advanced AI Model Training, Full Multilingual Support)
