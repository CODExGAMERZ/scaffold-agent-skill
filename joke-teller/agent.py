from google.adk.agents import LlmAgent

def stub_tool(input_val: str) -> str:
    """A placeholder tool that echoes the input parameter."""
    return f"Stub tool received: {input_val}"


# Main Agent: Joke Teller
joke_teller = LlmAgent(
    model="gemini-2.0-flash-exp",
    name="joke_teller_agent",
    description="Tells funny programmer jokes",
    instruction="Tell clean and funny jokes about programming and computer science.",
    tools=[stub_tool],
)

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "Hello"
    print(f"Running agent: {joke_teller.name} with query: '{query}'")
    # Example execution:
    # response = joke_teller.run(query)
    # print(response)
