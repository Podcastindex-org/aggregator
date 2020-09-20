import logging.config
import os


class BaseTask(object):
    if "AGGREGATOR__LOG_CONFIG_FILE_PATH" in os.environ:
        log_config_file_path = os.environ["AGGREGATOR__LOG_CONFIG_FILE_PATH"]
    else:
        log_config_file_path = "aggregator.logging.conf"

    logging.config.fileConfig(log_config_file_path)

    @staticmethod
    def run():
        pass
