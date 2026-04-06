from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="ury",
    version="0.0.1",   # ✅ hardcode version
    description="A Complete Restaurant Order Taking Software",
    author="Tridz Technologies",
    author_email="info@tridz.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires
)
