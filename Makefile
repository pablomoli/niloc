.PHONY: help setup install build run run-prod migrate upgrade health lint-static clean shell

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
	@echo "  make lint-static - Verify cache-busting on static JS script tags"
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

# Run development server (auto-finds available port if default is taken)
run: build
	@HOST=$${FLASK_RUN_HOST:-$${FLASK_HOST:-127.0.0.1}}; \
	 PORT=$${FLASK_RUN_PORT:-$${FLASK_PORT:-5000}}; \
	 while lsof -i :$$PORT >/dev/null 2>&1; do \
	   echo "Port $$PORT is in use, trying $$((PORT + 1))..."; \
	   PORT=$$((PORT + 1)); \
	 done; \
	 echo "Starting dev server at http://$${HOST}:$${PORT}"; \
	 . venv/bin/activate && FLASK_RUN_HOST=$${HOST} FLASK_RUN_PORT=$${PORT} flask --app app run --reload

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

# Verify static JS cache-busting is present in templates
lint-static:
	python3 python_scripts/check_static_version.py

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
