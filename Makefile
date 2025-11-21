.PHONY: help setup install build run run-prod migrate upgrade health clean shell

# Default target
help:
	@echo "Available targets:"
	@echo "  make setup      - Create virtual environment and install dependencies"
	@echo "  make install    - Install/update dependencies (assumes venv exists)"
	@echo "  make build      - Build CSS assets (runs npm run build)"
	@echo "  make run        - Run development server with auto-reload"
	@echo "  make run-prod   - Run production server with gunicorn"
	@echo "  make migrate    - Create a new database migration (use MESSAGE='description')"
	@echo "  make upgrade    - Apply database migrations"
	@echo "  make health     - Check API health endpoint"
	@echo "  make clean      - Remove Python cache files"
	@echo "  make shell      - Activate virtual environment shell"

# Setup virtual environment and install dependencies
setup:
	python -m venv venv
	. venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	@echo "Setup complete! Activate with: source venv/bin/activate"

# Install/update dependencies
install:
	. venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt

# Build CSS assets
build:
	npm run build

# Run development server
run: build
	. venv/bin/activate && flask --app app run --reload

# Run production server
run-prod: build
	. venv/bin/activate && gunicorn app:app

# Create database migration
migrate:
	@if [ -z "$(MESSAGE)" ]; then \
		echo "Error: MESSAGE is required. Usage: make migrate MESSAGE='description'"; \
		exit 1; \
	fi
	. venv/bin/activate && flask --app app db migrate -m "$(MESSAGE)"

# Apply database migrations
upgrade:
	. venv/bin/activate && flask --app app db upgrade

# Check API health
health:
	curl http://localhost:5000/api/health

# Clean Python cache files
clean:
	find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	@echo "Cleaned Python cache files"

# Activate virtual environment shell (helper)
shell:
	@echo "To activate the virtual environment, run:"
	@echo "  source venv/bin/activate"

