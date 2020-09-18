PROJECT_ID := podcastindex

SRC_PATH := $(shell pwd)/src:${PYTHONPATH}

PYTHON_DEV_SHELL := PYTHONPATH=$(SRC_PATH) poetry run

.PHONY: help init shell test flake8

help:
	@cat $(MAKEFILE_LIST)\
		| grep -e "^[a-zA-Z0-9_\-]*: *.*## *"\
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

init: ## Initialize virtual environment
	pip install poetry
	poetry install

shell: ## Run python shell
	$(PYTHON_DEV_SHELL) python

run: ## Launch aggregator
	$(PYTHON_DEV_SHELL) python src/run.py

test: ## Run automatic tests
	$(PYTHON_TEST_SHELL) python -m unittest discover -v

flake8: ## Check basic code style conventions
	$(PYTHON_DEV_SHELL) python -m flake8 --ignore=E501,W504 --builtins="unicode" src
	$(PYTHON_DEV_SHELL) python -m flake8 --ignore=E501,W504 test
