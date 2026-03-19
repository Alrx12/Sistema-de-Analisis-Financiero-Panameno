import requests
import uuid

BASE_URL = "http://127.0.0.1:8001/api/v1"

EMAIL_1 = f"user1_{uuid.uuid4().hex[:6]}@test.com"
EMAIL_2 = f"user2_{uuid.uuid4().hex[:6]}@test.com"
PASSWORD = "Test123!"

def print_title(title):
    print("\n" + "=" * 50)
    print(title)
    print("=" * 50)


def register_and_login(email):
    # register
    requests.post(f"{BASE_URL}/auth/register", json={
        "username": email.split("@")[0],
        "email": email,
        "password": PASSWORD,
        "full_name": "Test User"
    })

    # login
    res = requests.post(f"{BASE_URL}/auth/login", data={
        "username": email,
        "password": PASSWORD
    })

    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_accounts():
    headers_user1 = register_and_login(EMAIL_1)
    headers_user2 = register_and_login(EMAIL_2)

    print_title("1. Crear cuenta con last4")

    res = requests.post(f"{BASE_URL}/accounts", json={
        "bank_name": "Banco General",
        "account_type": "ahorros",
        "nickname": "BG principal",
        "account_number_last4": "1234"
    }, headers=headers_user1)

    print(res.status_code, res.json())
    account1 = res.json()["account_id"]

    print_title("2. Crear cuenta SIN last4")

    res = requests.post(f"{BASE_URL}/accounts", json={
        "bank_name": "BAC",
        "account_type": "corriente",
        "nickname": "BAC gastos"
    }, headers=headers_user1)

    print(res.status_code, res.json())
    account2 = res.json()["account_id"]

    print_title("3. Intentar duplicado (debe fallar)")

    res = requests.post(f"{BASE_URL}/accounts", json={
        "bank_name": "Banco General",
        "account_type": "ahorros",
        "nickname": "BG principal",
        "account_number_last4": "1234"
    }, headers=headers_user1)

    print(res.status_code, res.text)

    print_title("4. Listar cuentas (user1)")

    res = requests.get(f"{BASE_URL}/accounts", headers=headers_user1)
    print(res.json())

    print_title("5. Ver aislamiento entre usuarios")

    res = requests.get(f"{BASE_URL}/accounts", headers=headers_user2)
    print("User2 cuentas:", res.json())

    print_title("6. Obtener cuenta específica")

    res = requests.get(f"{BASE_URL}/accounts/{account1}", headers=headers_user1)
    print(res.json())

    print_title("7. Intentar acceder cuenta de otro usuario (debe fallar)")

    res = requests.get(f"{BASE_URL}/accounts/{account1}", headers=headers_user2)
    print(res.status_code, res.text)

    print_title("8. Actualizar nickname (sin last4)")

    res = requests.patch(f"{BASE_URL}/accounts/{account2}", json={
        "nickname": "BAC gastos editado"
    }, headers=headers_user1)

    print(res.status_code, res.json())

    print_title("9. Soft delete")

    res = requests.delete(f"{BASE_URL}/accounts/{account1}", headers=headers_user1)
    print(res.status_code)

    print_title("10. Verificar que no aparece en listado")

    res = requests.get(f"{BASE_URL}/accounts", headers=headers_user1)
    print(res.json())

    print_title("11. Intentar actualizar cuenta eliminada")

    res = requests.patch(f"{BASE_URL}/accounts/{account1}", json={
        "nickname": "test"
    }, headers=headers_user1)

    print(res.status_code, res.text)


if __name__ == "__main__":
    test_accounts()