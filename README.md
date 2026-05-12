## Installation / Setup

After cloning the project, install the required dependencies:

```bash
npm install
npm ci
```
Create a .env file in the project root:
```
cp .env.example .env
```
inside .env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY= 
OPENROUTER_MODEL=openrouter/free
PORT=3000

For development
```
npm run dev
```
