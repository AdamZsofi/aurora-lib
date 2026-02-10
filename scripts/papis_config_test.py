import os

import papis.config as config


def main() -> None:
    print("PAPIS_CONFIG_DIR:", os.environ.get("PAPIS_CONFIG_DIR"))
    print("Config folder:", config.get_config_folder())
    print("Config file:", config.get_config_file())
    print("Config home:", config.get_config_home())


if __name__ == "__main__":
    main()
