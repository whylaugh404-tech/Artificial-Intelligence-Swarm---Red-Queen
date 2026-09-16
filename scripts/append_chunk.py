import sys

def main():
    chunk = sys.stdin.read()
    with open('data/students.csv', 'a') as f:
        f.write(chunk)
    print(f"Appended {len(chunk.splitlines())} lines.")

if __name__ == '__main__':
    main()
