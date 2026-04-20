with open("src/routes/index.tsx", "r") as f:
    text = f.read()

text = text.replace('import { Button } from "../components/ui/button";\n', '')

# Replace the specific button
find_btn = '''<button
type="button"
onClick={handleSubmit as any}
disabled={testConnectionMutation.isPending || saveConnectionMutation.isPending}'''
repl_btn = '''<button
type="submit"
disabled={testConnectionMutation.isPending || saveConnectionMutation.isPending}'''

text = text.replace(find_btn, repl_btn)

with open("src/routes/index.tsx", "w") as f:
    f.write(text)
