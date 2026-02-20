# Sample Project
This is a template for a Data Science project using Python, conda for environment management and Quarto for documentation.

To adapt to your individual project change `sample` to the respective project name in the commands below

Adapt the `LICENSE` as required.

Provide a brief description of the project here.

## Project Organisation
According to [Is It Ops That Make Data Science Scientific? Archives of Data Science, Series A, vol 8, p. 12, 2022.](https://publikationen.bibliothek.kit.edu/1000150238/152958955)

![The Data Science Process](docs/pics/dsprocess.png)

Code and configurations used in the different project phases are stored in the subfolders

* `data_acquisition`
* `eda`
* `modelling`
* `deployment`

Templates for the documentation artefacts from the different project phases are provided in the subfolder `docs` in the form of a Quarto project:

* Project charta
* Data report
* Modelling report
* Evaluation decision log

See section `Quarto Setup and Usage` for instructions on how to build and serve the documentation website from the indvidual reports using Quarto.

## Python Environment Setup and Management with uv
Make sure to have uv installed: https://docs.astral.sh/uv/getting-started/installation/

After cloning the repository,  create the python environment with all dependencies based on the `.python-version`, `pyproject.toml` and `uv.lock` files by running
```bash
uv sync
```

To add new dependencies, use
```bash
uv add <package>
```
which will add the package to `pyproject.toml` and update the `uv.lock` file. You can also specify a version, e.g. `uv add pandas==2.0.3`.

Remove packages with
```bash
uv remove <package>
```

Commit changes to `pyproject.toml` and `uv.lock` files into version control.

Run `uv sync` after pulling changes to update the local environment.

Whenever the python environment is used, make sure to prefix every command that uses python with `uv run`, e.g.
```bash
uv run python script.py
```

## Runtime Configuration with Environment Variables
The environment variables are specified in a .env-File, which is never commited into version control, as it may contain secrets. The repo just contains the file `.env.template` to demonstrate how environment variables are specified.

You have to create a local copy of `.env.template` in the project root folder and the easiest is to just rename it to `.env`.

The content of the .env-file is then read by the pypi-dependency: `python-dotenv`. Usage:
```python
import os
from dotenv import load_dotenv
```

`load_dotenv` reads the .env-file and sets the environment variables:

```python
load_dotenv()
```

which can then be accessed (assuming the file contains a line `SAMPLE_VAR=<some value>`):

```python
os.environ['SAMPLE_VAR']
```

## Quarto Setup and Usage
If Quarto is used to build a documentation website as described in the Project Organisation section, you need to 
### Setup Quarto

1. [Install Quarto](https://quarto.org/docs/get-started/)
2. Optional: [quarto-extension for VS Code](https://marketplace.visualstudio.com/items?itemName=quarto.quarto)
3. If working with svg files and pdf output you will need to install rsvg-convert:
    * On macOS, this can be done via `brew install librsvg`
    * on Windows  using chocolatey:
      * [Install chocolatey](https://chocolatey.org/install#individual)
      * [Install rsvg-convert](https://community.chocolatey.org/packages/rsvg-convert) * run in a terminal: `choco install rsvg-convert`

Source `*.qmd` and configuration files are in the `docs` folder. The quarto project configuration is setup as follows:

Base config: `docs/_quarto.yml`  
Two profiles (https://quarto.org/docs/projects/profiles.html) allow you two generate two different outputs from the same source files. With the benefit to reuse as much as possible from the ongoing project documentation in the final thesis:

- Website documentation: `docs/_quarto-website.yml`
  `quarto render --profile website` renders  to `docs/build`
- book project - thesis document: `docs/_quarto-thesis.yml`  
`quarto render --profile thesis` renders to `docs/thesis`

With embedded python code chunks that perform computations, you need to make sure that the python environment is activated when rendering. This can be done by prefixing the render command with `uv run`, e.g.:
```bash
uv run quarto render
```

The default profile, which is used when the `quarto render` command is used without argument, can be set in `docs/_quarto.yml` according to the current need when working with local previews etc.  
Further adaptations to the configuration files as needed.

### Contributions to the Website Documentation

1. Make changes to the `.qmd` source files
2. Preview: `quarto preview` (default pofile in `docs/_quarto.yml` is set to `website`). Therefore also preview in vscode automatically loads the website profile
2. Build the documentation website by running `quarto render --profile website` from the `docs` subfolder. This will push all files into the `docs/build` subfolder.
3. You can check the website locally by opening `docs/build/index.html` in a browser
4. `docs/build` is excluded from git versioning. The workflow file in `.github/workflows/` configures automatic remote build and deployment as an Azure static web app

### Deployment of the Website Documentation

A github actions workflow file (`.github/workflows/azure-static-web-apps-ashy-pond-07dfc0003.yml`) ensures that every push/merge to the `main` branch triggers a build and deployment as an Azure static Web-App

: https://spectraltuning.manuel-doemer.ch.  
The Web-App configuration is in `staticwebapp.config.json`.  
The setting
```
    execute:
        freeze: auto
```
in the `_quarto.yml` file ensures that all the python computations are only performed locally (with the last `render` command before push) and checked into the repository under `docs/.freeze`, so that no Python code is executed by the github runners and the pre-computed results are actually used in the remote build and deployment.


### Using Github Actions to Publish the Documentation Website
#### Azure Static Web App
A github actions workflow file (`.github/workflows/<xyz>>.yml`) ensures that every push/merge to the `main` branch triggers a build and deployment as an Azure static Web-App


The Web-App configuration is in `staticwebapp.config.json`.  
The setting
```
    execute:
        freeze: auto
```
in the `_quarto.yml` file ensures that all the python computations are only performed locally (with the last `render` command before push) and checked into the repository under `docs/.freeze`, so that no Python code is executed by the github runners and the pre-computed results are actually used in the remote build and deployment.

#### Github Pages
If you would like to use github pages to serve the documentation website, and at the same time avoid pushing the rendered files into the repo (makes very ugly diffs) but executing embedded code blocks only locally, the initial setup (only needed once) of the github action is according to https://quarto.org/docs/publishing/github-pages.html#github-action as follows: 

1. Add 
    ```yaml
        execute:
            freeze: auto
    ```
    to the `_quarto.yml` file
2. execute `quarto render` from the `docs` folder
3. run `quarto publish gh-pages` (generates and pushes a branch called `gh-pages`)
4. make sure that github pages is configured to serve the root of the `gh-pages` branch
4. add the definition of the github action workflow `.github/workflows/publish.yml` (see below)
5. check all of the newly created files (including the `_freeze` directory) into the `main` branch of the repository 
6. `docs/build` is excluded by the `.gitignore`
7. then push to `main`

Github action workflow configuration file to add in `.github/workflows/publish.yml`:
```yaml
on:
  workflow_dispatch:
  push:
    branches: main

name: Quarto Publish

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Check out repository
        uses: actions/checkout@v4
    
      - name: Install librsvg
        run: sudo apt-get install librsvg2-bin

      - name: Set up Quarto
        uses: quarto-dev/quarto-actions/setup@v2
        with:
          tinytex: true

      - name: Render and Publish
        uses: quarto-dev/quarto-actions/publish@v2
        with:
          target: gh-pages
          path: docs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### Publish Changes
After setup of the corresponding github action, every update just needs:

1. Build the website by running `quarto render` from the `docs` subfolder. This will push the rendered files into `docs/build` (not checked into the repository via .gitignore) and computations in the `docs/_freeze` (checked in so that github action runners to not need python) subfolder.
2. Check the website locally by opening the  `docs/build/index.html`
3. Push all updated files into the `main` branch. This will trigger a github action that
    - pushes an update to the `github-pages` branch
    - renders and publishes the site to https://<your user handle>.github.io/sample/

Additional notes:
* Rendering `svg`-files requires the `librsvg` package. The github action (Linux Ubuntu) installs it via `sudo apt-get install librsvg2-bin`. To render locally, you need to install it on your system as well. On macOS, this can be done via `brew install librsvg`. On Windows you can use chocholatey to install it: `choco install rsvg-convet` (https://community.chocolatey.org/packages?&tags=librsvg).

### Contributions to the thesis:

Files that come in addition to the website documentation:

* `bibliography.qmd` for the bibliography
* Appendix (`appendices`)
* `format pdf template-partials: - before-body.tex` specifies the pages before the table of contents containing preface, abstract, placeholder for declaration of independence etc.. These contents must therefore be adapted directly in this `.tex` file.


1. Make changes to the `.qmd` source files
2. For preview: `quarto preview --profile thesis`. Falls der vscode-Preview für das pdf verwendet werden soll, muss in der Datei `_quarto.yml` "default: website" auf "thesis" umgestellt werden.
3. Build the report by running `quarto render --profile thesis` from the `docs` subfolder. This will push all files into the `docs/thesis` subfolder.
4. You can check the generated pdf
5. Modify manually the thesis pdf as needed in the `docs/thesis_final`  subfolder. This is the final version of the thesis document that will be submitted. The `docs/thesis` subfolder is only for the intermediate files generated by quarto.
    * copy the thesis pdf document into `docs/thesis_final`
    * fill out the cover page templates in `docs/thesis_final`
    * generate pdf pages from the templates
    * replace the placeholders in the thesis pdf with the separately generated pdf pages


## Further Information
* "About Readmes" on Github
https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
* [Python Dev Guide](refs/python_dev_guide.md)