import json
import goplus
from goplus.token import Token
from termcolor import colored
import asyncio
from datetime import datetime

log_filename = "go5_log.txt"  # Define the log file name

def fetch_and_cache_data(chain_id, addresses, timeout=None):
    try:
        with open("cached_data.json", "r") as file:
            cached_data = json.load(file)
            if 'result' in cached_data and cached_data['result'] and cached_data['result'].keys() == set(addresses):
                return cached_data
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass

    token = Token(access_token=None)
    data = token.token_security(chain_id=chain_id, addresses=addresses, **{"_request_timeout": timeout}) if timeout else token.token_security(chain_id=chain_id, addresses=addresses)
    with open("cached_data.json", "w") as file:
        json.dump(data.to_dict(), file)

    return data.to_dict()

def print_selected_values(data):
    if data is None or 'result' not in data or not data['result']:
        custom_print("No data available for the token.")
        return None

    selected_keys = [
        'is_open_source', 'is_proxy', 'is_mintable', 'owner_address', 'can_take_back_ownership',
        'owner_change_balance', 'hidden_owner', 'selfdestruct', 'external_call', 'buy_tax',
        'sell_tax', 'anti_whale_modifiable', 'can_take_back_ownership', 'cannot_buy',
        'cannot_sell_all', 'creator_address', 'token_symbol', 'total_supply', 'trading_cooldown',
        'slippage_modifiable', 'sell_tax', 'selfdestruct', 'personal_slippage_modifiable',
        'owner_percent', 'owner_balance'
    ]

    selected_data = {}
    for address, address_data in data['result'].items():
        for key in selected_keys:
            if key in address_data:
                selected_data[key] = address_data[key]

    custom_print("Selected Data Passed to Main Program:")
    custom_print(json.dumps(selected_data, indent=2))

    return selected_data

async def check_token(address, pair_address, selected_data):
    # Perform token check using the selected_data
    # You can add your token checking logic here
    # This is just a placeholder function
    check_result = {
        "address": address,
        "pair_address": pair_address,
        "is_valid": True,
        "message": "Token passed the check"
    }
    return check_result

def custom_print(*args, **kwargs):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted_args = [timestamp] + [str(arg) for arg in args]
    output = ' '.join(formatted_args)
    with open(log_filename, 'a', encoding='utf-8') as log_file:
        log_file.write(output + '\n')
    print(output)

if __name__ == "__main__":
    chain_id = "1"
    addresses = ["0x15ee3f09712f4715904e1923c1ad504a673e88ac"]
    timeout = 10
    data = fetch_and_cache_data(chain_id, addresses, timeout)
    selected_data = print_selected_values(data)

    if selected_data is not None:
        # Pass the selected_data dictionary to check_token function
        check_result = asyncio.run(check_token(addresses[0], "PAIR_ADDRESS", selected_data))
        custom_print("Check Result:")